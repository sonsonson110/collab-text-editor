import { useCallback, useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import { LINE_HEIGHT } from "@/constants";
import { CollaborativeDocument } from "@/core/document/collaborativeDocument";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import {
  broadcastCursor,
  type ConnectedUser,
  type RemoteCursorAbsolute,
} from "@/collaboration/awareness";
import { YjsUndoManager } from "@/collaboration/yjsUndoManager";
import type { ConnectionStatus } from "@/ui/components";
import { TOP_PADDING_RESERVATION_KEYS } from "@/view/types";
import { useEditorStore } from "@/store/editorStore";

/** Palette used to assign each remote collaborator a distinct cursor color. */
const REMOTE_CURSOR_COLORS = [
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#e8590c",
  "#9c36b5",
  "#0c8599",
  "#d6336c",
  "#5c7cfa",
];

interface UseCollaborativeEditorProps {
  /** The room's UUID (used as the Yjs room name and WebSocket path segment). */
  roomId: string;
  /** A valid JWT (guest or member) for the WebSocket upgrade handshake. */
  token: string;
}

interface UseCollaborativeEditorResult {
  viewModel: ViewModel | null;
  status: ConnectionStatus;
  users: ConnectedUser[];
  /**
   * Reconnects the WebSocket provider with a new token while preserving the
   * local Y.Doc state. Used after claiming a room (guest → member upgrade).
   *
   * Re-wires all awareness listeners so the new identity (display name, color)
   * is broadcast to peers and the signed-in user can see existing peers.
   *
   * @param newToken The new Member JWT to connect with.
   */
  reconnect: (newToken: string) => void;
}

/**
 * Deterministically generates a hash code from a string.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Deterministically generates a display name based on a user ID.
 * This ensures consistency across multiple tabs for the same session.
 */
function generateDeterministicDisplayName(userId: string | null): string {
  const hash = hashCode(userId ?? "anonymous");
  return `User ${hash % 1000}`;
}

/**
 * Bootstraps the entire collaborative editing session.
 *
 * Creates the Yjs document, WebSocket provider, editor state, and view model,
 * then wires up awareness broadcasting and remote-cursor collection.
 *
 * The WebSocket URL is constructed from the Vite proxy path:
 * `/ws/<roomId>?token=<jwt>` — the Vite dev server proxies `/ws` to the
 * sync-server, and Nginx does the same in production.
 *
 * Returns `{ viewModel, status, users, reconnect }` — the view model is
 * `null` until the provider has connected and the editor state is ready.
 */
export function useCollaborativeEditor({
  roomId,
  token,
}: UseCollaborativeEditorProps): UseCollaborativeEditorResult {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  // Stable refs so reconnect() can access the latest instances without being
  // listed as useEffect dependencies.
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const vmRef = useRef<ViewModel | null>(null);
  const editorStateRef = useRef<EditorState | null>(null);
  const initialUserId = extractUserId(token);
  const userHash = hashCode(initialUserId ?? "anonymous");

  const colorRef = useRef<string>(
    REMOTE_CURSOR_COLORS[userHash % REMOTE_CURSOR_COLORS.length]!,
  );

  /**
   * Deterministic display name assigned once per hook mount and held stable for the
   * lifetime of this session. Stored in a ref so reconnect() reuses the same
   * name without triggering re-renders.
   */
  const displayNameRef = useRef<string>(generateDeterministicDisplayName(initialUserId));

  /**
   * Tracks the unsubscribe function returned by `editorState.subscribe()`
   * inside `wireAwareness`. Called before re-subscribing on reconnect to
   * prevent leaked listeners that reference destroyed awareness instances.
   */
  const cursorBroadcastUnsubRef = useRef<(() => void) | null>(null);

  // Derive the WS base URL: in dev the Vite proxy rewrites /ws → sync-server.
  // In production Nginx does the same. We never hardcode a port here.
  const wsBaseUrl =
    (import.meta.env.VITE_WS_URL as string | undefined) ??
    `${window.location.origin.replace(/^http/, "ws")}/ws`;

  /**
   * Wires awareness state for a given provider:
   *   1. Sets the local user field (name + color) so peers can render our avatar.
   *   2. Publishes `userId` so peers can deduplicate stale awareness entries that
   *      linger after a page reload (each reload creates a new Yjs `clientID`
   *      for the same logical user).
   *   3. Attaches the `change` listener that builds the connected-user list and
   *      remote cursors.
   *   4. Re-subscribes the editor state so cursor moves are broadcast.
   *
   * Extracted so both the initial mount and `reconnect()` share identical wiring.
   */
  function wireAwareness(
    provider: WebsocketProvider,
    ydoc: Y.Doc,
    ytext: Y.Text,
    doc: CollaborativeDocument,
    token: string,
  ): void {
    const awareness = provider.awareness;

    // Publish our session identity to peers.
    awareness.setLocalStateField("user", {
      name: displayNameRef.current,
      color: colorRef.current,
    });

    // Publish userId and lastActive timestamp so peers can deduplicate tabs
    // and stale awareness entries by picking the most recently active session.
    const localUserId = extractUserId(token);
    if (localUserId !== null) {
      awareness.setLocalStateField("userId", localUserId);
    }
    awareness.setLocalStateField("lastActive", Date.now());

    awareness.on("change", () => {
      const states = awareness.getStates();
      
      // Pass 1: Deduplicate active clients by userId based on lastActive timestamp.
      // We always force the local client to win for its own presence bar.
      const bestClientPerUser = new Map<
        string,
        { clientID: number; entry: ConnectedUser; lastActive: number }
      >();

      states.forEach((state: Record<string, unknown>, clientID: number) => {
        const userInfo = state["user"] as { name: string; color: string } | undefined;
        if (!userInfo) {
          return;
        }

        const stateUserId = typeof state["userId"] === "string" ? state["userId"] : null;
        const isLocal = clientID === ydoc.clientID;
        
        const key = stateUserId !== null ? stateUserId : `clientID:${clientID}`;
        const lastActive = typeof state["lastActive"] === "number" ? state["lastActive"] : 0;
        
        const entry: ConnectedUser = {
          clientID,
          name: userInfo.name,
          color: userInfo.color,
          isLocal,
        };

        const existing = bestClientPerUser.get(key);
        
        if (isLocal) {
           bestClientPerUser.set(key, { clientID, entry, lastActive: Infinity });
        } else if (!existing) {
           bestClientPerUser.set(key, { clientID, entry, lastActive });
        } else {
           if (existing.lastActive !== Infinity && lastActive > existing.lastActive) {
               bestClientPerUser.set(key, { clientID, entry, lastActive });
           }
        }
      });

      const connectedUsers: ConnectedUser[] = [];
      const activeClientIds = new Set<number>();

      bestClientPerUser.forEach((value) => {
        connectedUsers.push(value.entry);
        activeClientIds.add(value.clientID);
      });

      // Pass 2: Collect valid remote cursors for the winning active clients only.
      const cursors: RemoteCursorAbsolute[] = [];

      states.forEach((state: Record<string, unknown>, clientID: number) => {
        // Only render cursors for the most recently active client per user
        if (!activeClientIds.has(clientID)) {
          return;
        }

        const isLocal = clientID === ydoc.clientID;
        if (isLocal) {
          return;
        }

        const stateUserId = typeof state["userId"] === "string" ? state["userId"] : null;
        
        // Suppress self-cursors: don't show cursors from other tabs of the local user
        if (stateUserId !== null && stateUserId === localUserId) {
          return;
        }

        const userInfo = state["user"] as { name: string; color: string } | undefined;
        if (!userInfo) {
          return;
        }

        const cursorState = state["cursor"] as
          | {
              anchor: Y.RelativePosition;
              head: Y.RelativePosition;
            }
          | null
          | undefined;

        if (cursorState) {
          const anchorAbs = Y.createAbsolutePositionFromRelativePosition(
            cursorState.anchor,
            ydoc,
          );
          const headAbs = Y.createAbsolutePositionFromRelativePosition(
            cursorState.head,
            ydoc,
          );

          if (anchorAbs && headAbs) {
            cursors.push({
              clientID,
              user: userInfo,
              anchor: doc.getPositionAt(anchorAbs.index),
              head: doc.getPositionAt(headAbs.index),
            });
          }
        }
      });

      if (vmRef.current) {
        vmRef.current.setRemoteCursors(cursors);

        const hasRemoteOnLine0 = cursors.some((c) => c.head.line === 0);
        vmRef.current.reserveTopPadding(
          TOP_PADDING_RESERVATION_KEYS.REMOTE_CURSOR_LINE_0,
          hasRemoteOnLine0 ? LINE_HEIGHT : 0,
        );
      }

      setUsers(connectedUsers);
    });

    // Clean up previous cursor-broadcast subscription before re-subscribing.
    // Without this, reconnect() would stack listeners, with stale ones
    // referencing the destroyed awareness instance.
    if (cursorBroadcastUnsubRef.current) {
      cursorBroadcastUnsubRef.current();
      cursorBroadcastUnsubRef.current = null;
    }

    // Re-broadcast local cursor after every editor state change.
    const editorState = editorStateRef.current;
    if (editorState) {
      cursorBroadcastUnsubRef.current = editorState.subscribe(() => {
        awareness.setLocalStateField("lastActive", Date.now());
        const activeCursor = editorState.getCursor();
        broadcastCursor(
          awareness,
          ytext,
          doc,
          activeCursor.anchor,
          activeCursor.active,
        );
      });
    }
  }

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("content");

    const provider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
      connect: true,
      params: { token },
    });
    providerRef.current = provider;

    // Register a custom message handler for MSG_SNAPSHOT_SAVED (type 4).
    // The sync-server broadcasts this after each successful snapshot persistence.
    registerSnapshotSavedHandler(provider);

    const doc = new CollaborativeDocument(ytext);

    const cursor = new Cursor(new Position(0, 0));
    const undoManager = new YjsUndoManager(ytext);
    const editorState = new EditorState(doc, cursor, undoManager, ydoc, ytext);
    editorStateRef.current = editorState;

    const vm = new ViewModel(editorState);
    vmRef.current = vm;
    setViewModel(vm);

    const storeUnsubscribe = editorState.subscribe(() => {
      const activeCursor = editorState.getCursor().active;
      const selectionCount = editorState.getSelectedText().length;
      useEditorStore.getState().setCursorPosition({
        line: activeCursor.line,
        column: activeCursor.column,
      });
      useEditorStore.getState().setSelectionCount(selectionCount);
    });

    const initialCursor = editorState.getCursor().active;
    const initialSelectionCount = editorState.getSelectedText().length;
    useEditorStore.getState().setCursorPosition({
      line: initialCursor.line,
      column: initialCursor.column,
    });
    useEditorStore.getState().setSelectionCount(initialSelectionCount);

    wireAwareness(provider, ydoc, ytext, doc, token);

    // Track connection status for the UI indicator.
    provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s as ConnectionStatus);
    });

    return () => {
      storeUnsubscribe();
      useEditorStore.getState().setLastSavedAt(null);
      provider.destroy();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, wsBaseUrl]);

  /**
   * Swaps the WebSocket provider to use a new token, preserving the Y.Doc.
   *
   * Re-wires all awareness listeners so the updated identity is broadcast to
   * peers. The session display name is intentionally preserved across reconnects
   * so peers see a stable name even after a guest upgrades to a member token.
   */
  const reconnect = useCallback(
    (newToken: string) => {
      if (!providerRef.current || !ydocRef.current) {
        return;
      }
      const ydoc = ydocRef.current;
      const ytext = ydoc.getText("content");
      providerRef.current.destroy();

      const newProvider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
        connect: true,
        params: { token: newToken },
      });
      providerRef.current = newProvider;

      registerSnapshotSavedHandler(newProvider);

      const doc = new CollaborativeDocument(ytext);
      wireAwareness(newProvider, ydoc, ytext, doc, newToken);

      newProvider.on("status", ({ status: s }: { status: string }) => {
        setStatus(s as ConnectionStatus);
      });
    },
    // wireAwareness is defined in the render scope; roomId and wsBaseUrl are
    // the only external stable dependencies.
    [roomId, wsBaseUrl],
  );

  return { viewModel, status, users, reconnect };
}

/**
 * Extracts the `sub` claim from a JWT without signature verification.
 *
 * Used only for awareness deduplication (identifying stale entries from the
 * same logical user across reconnects). Returns `null` for malformed tokens.
 */
function extractUserId(token: string): string | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) {
      return null;
    }
    const payload = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
    const sub = payload["sub"];
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Custom message type matching the sync-server's `MSG_SNAPSHOT_SAVED`.
 *
 * Index 4 avoids collisions with y-websocket's built-in message types:
 * 0 = Sync, 1 = Awareness, 2 = Auth, 3 = QueryAwareness.
 */
const MSG_SNAPSHOT_SAVED = 4;

/**
 * Registers a custom message handler on the WebsocketProvider for
 * `MSG_SNAPSHOT_SAVED` messages broadcast by the sync-server.
 *
 * The handler reads the Float64 timestamp from the binary message and updates
 * the Zustand editor store so the BottomBar can display the last save time.
 */
function registerSnapshotSavedHandler(provider: WebsocketProvider): void {
  // The y-websocket v3 provider exposes a per-instance `messageHandlers` array
  // (copied from the module-level defaults in the constructor). We install our
  // handler at index 4 — the provider's readMessage() dispatches by index.
  (provider as unknown as { messageHandlers: unknown[] }).messageHandlers[
    MSG_SNAPSHOT_SAVED
  ] = (_encoder: unknown, decoder: decoding.Decoder): void => {
    const timestamp = decoding.readFloat64(decoder);
    useEditorStore.getState().setLastSavedAt(timestamp);
  };
}
