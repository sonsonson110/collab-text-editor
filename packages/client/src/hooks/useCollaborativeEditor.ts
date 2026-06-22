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
  /** A valid WebSocket Room Ticket for the connection handshake. */
  ticket: string;
}

interface UseCollaborativeEditorResult {
  viewModel: ViewModel | null;
  status: ConnectionStatus;
  users: ConnectedUser[];
  /**
   * Whether the initial Yjs sync handshake has completed.
   *
   * `false` until the server's full document state (including any hydrated
   * snapshot) has been transmitted to the client via the SyncStep1/SyncStep2
   * round-trip. The editor should not be interactive until this is `true`.
   */
  isSynced: boolean;
  /**
   * Reconnects the WebSocket provider with a new token while preserving the
   * local Y.Doc state. Used after claiming a room (guest → member upgrade).
   *
   * Re-wires all awareness listeners so the new identity (display name, color)
   * is broadcast to peers and the signed-in user can see existing peers.
   *
   * @param newTicket The new Room Ticket to connect with.
   */
  reconnect: (newTicket: string) => void;
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
  ticket,
}: UseCollaborativeEditorProps): UseCollaborativeEditorResult {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [isSynced, setIsSynced] = useState(false);

  // Stable refs so reconnect() can access the latest instances without being
  // listed as useEffect dependencies.
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const vmRef = useRef<ViewModel | null>(null);
  const editorStateRef = useRef<EditorState | null>(null);
  const initialUserId = extractUserId(ticket);
  const userHash = hashCode(initialUserId ?? "anonymous");

  const colorRef = useRef<string>(
    REMOTE_CURSOR_COLORS[userHash % REMOTE_CURSOR_COLORS.length]!,
  );

  /**
   * Deterministic display name assigned once per hook mount and held stable for the
   * lifetime of this session. Stored in a ref so reconnect() reuses the same
   * name without triggering re-renders.
   */
  const displayNameRef = useRef<string>(
    generateDeterministicDisplayName(initialUserId),
  );

  /**
   * Tracks the unsubscribe function returned by `editorState.subscribe()`
   * inside `wireAwareness`. Called before re-subscribing on reconnect to
   * prevent leaked listeners that reference destroyed awareness instances.
   */
  const cursorBroadcastUnsubRef = useRef<(() => void) | null>(null);

  /**
   * Tracks the ytext observer cleanup function returned by `wireAwareness`.
   * Called before calling `wireAwareness` again on reconnect to prevent
   * multiple ytext observers from stacking on the same Y.Text instance.
   */
  const wireAwarenessUnsubRef = useRef<(() => void) | null>(null);

  // Derive the WS base URL: in dev the Vite proxy rewrites /ws → sync-server.
  // In production Nginx does the same. We never hardcode a port here.
  const wsBaseUrl =
    (import.meta.env.VITE_WS_URL as string | undefined) ??
    `${window.location.origin.replace(/^http/, "ws")}/ws`;

  /**
   * Wires awareness state for a given provider:
   *   1. Sets the local user identity (name, color, userId, role, cursor) in a
   *      single atomic update so peers never see an intermediate partial state.
   *   2. Attaches the `change` listener that builds the connected-user list and
   *      re-resolves remote cursors.
   *   3. Adds a ytext observer that re-resolves remote cursors whenever a remote
   *      sync update arrives (fixes the "1 keystroke late" cursor lag).
   *   4. Re-subscribes the editor state so cursor moves are broadcast.
   *
   * Returns a cleanup function that removes the ytext observer. The caller must
   * invoke this before calling `wireAwareness` again (e.g., on reconnect) to
   * avoid stacking observers on the same Y.Text instance.
   *
   * Extracted so both the initial mount and `reconnect()` share identical wiring.
   */

  /**
   * Resolves all remote cursor relative positions against the current ydoc
   * and pushes them to the ViewModel. Called from both the awareness `change`
   * handler and the ytext observer so that remote cursors are re-rendered
   * immediately after a sync update arrives (not just on the next awareness event).
   */
  const resolveAndSetRemoteCursors = useCallback(
    (
      states: Map<number, Record<string, unknown>>,
      ydoc: Y.Doc,
      doc: CollaborativeDocument,
      localUserId: string | null,
      activeClientIds: Set<number>,
    ): void => {
    const cursors: RemoteCursorAbsolute[] = [];

    states.forEach((state: Record<string, unknown>, clientID: number) => {
      if (!activeClientIds.has(clientID)) return;
      if (clientID === ydoc.clientID) return;

      const stateUserId =
        typeof state["userId"] === "string" ? state["userId"] : null;
      // Suppress self-cursors from other tabs of the same user.
      if (stateUserId !== null && stateUserId === localUserId) return;

      const userInfo = state["user"] as
        | { name: string; color: string }
        | undefined;
      if (!userInfo) return;

      const cursorState = state["cursor"] as
        | { anchor: Y.RelativePosition; head: Y.RelativePosition }
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
  }, []);

  const wireAwareness = useCallback(
    (
      provider: WebsocketProvider,
      ydoc: Y.Doc,
      ytext: Y.Text,
      doc: CollaborativeDocument,
      ticket: string,
      isViewer: boolean,
    ): () => void => {
    const awareness = provider.awareness;

    // ── Publish local identity in a single atomic update ─────────────────────
    // Using setLocalState (instead of multiple setLocalStateField calls) ensures
    // that all fields — user, userId, lastActive, cursor, and role — are sent in
    // one MSG_AWARENESS message. This prevents remote peers from receiving
    // intermediate states (e.g., `user` present but `role` not yet set) which
    // could temporarily show a VIEWER as a non-viewer or miss them entirely.
    const localUserId = extractUserId(ticket);
    const localState: Record<string, unknown> = {
      user: { name: displayNameRef.current, color: colorRef.current },
      lastActive: Date.now(),
    };
    if (localUserId !== null) {
      localState["userId"] = localUserId;
    }
    if (isViewer) {
      // Viewers publish null cursor so stale cursor state is never rendered
      // for them. The role field lets editors show the "View-only" indicator.
      localState["cursor"] = null;
      localState["role"] = "VIEWER";
    }
    awareness.setLocalState(localState);

    // ── Build the active-client set used by both cursor-resolution paths ──────
    // Shared between the awareness `change` handler and the ytext observer so
    // we don't duplicate the deduplication logic.
    let activeClientIds = new Set<number>();

    // ── Awareness change handler ──────────────────────────────────────────────
    // Fires when any peer joins, leaves, or updates their state.
    // Rebuilds the presence-bar user list AND re-resolves remote cursors.
    awareness.on("change", () => {
      const states = awareness.getStates();

      // Pass 1: Deduplicate active clients by userId based on lastActive timestamp.
      // We always force the local client to win for its own presence bar.
      const bestClientPerUser = new Map<
        string,
        { clientID: number; entry: ConnectedUser; lastActive: number }
      >();

      states.forEach((state: Record<string, unknown>, clientID: number) => {
        const userInfo = state["user"] as
          | { name: string; color: string }
          | undefined;
        if (!userInfo) return;

        const stateUserId =
          typeof state["userId"] === "string" ? state["userId"] : null;
        const isLocal = clientID === ydoc.clientID;

        const key = stateUserId !== null ? stateUserId : `clientID:${clientID}`;
        const lastActive =
          typeof state["lastActive"] === "number" ? state["lastActive"] : 0;

        const entry: ConnectedUser = {
          clientID,
          name: userInfo.name,
          color: userInfo.color,
          isLocal,
          // For the local client use the known isViewer flag; for remote peers
          // read the role field they published in their awareness state.
          isViewer: isLocal ? isViewer : state["role"] === "VIEWER",
        };

        const existing = bestClientPerUser.get(key);
        if (isLocal) {
          bestClientPerUser.set(key, { clientID, entry, lastActive: Infinity });
        } else if (!existing) {
          bestClientPerUser.set(key, { clientID, entry, lastActive });
        } else if (
          existing.lastActive !== Infinity &&
          lastActive > existing.lastActive
        ) {
          bestClientPerUser.set(key, { clientID, entry, lastActive });
        }
      });

      const connectedUsers: ConnectedUser[] = [];
      // Update the shared activeClientIds so the ytext observer uses the same set.
      activeClientIds = new Set<number>();

      bestClientPerUser.forEach((value) => {
        connectedUsers.push(value.entry);
        activeClientIds.add(value.clientID);
      });

      // Pass 2: Re-resolve all remote cursors with the current ydoc state.
      resolveAndSetRemoteCursors(
        states,
        ydoc,
        doc,
        localUserId,
        activeClientIds,
      );

      setUsers(connectedUsers);
    });

    // ── ytext observer — re-resolve cursors after remote syncs ────────────────
    // The `awareness.on("change")` handler only fires when awareness state
    // changes, NOT when a Yjs sync update (new text) arrives. This means remote
    // cursors stay stuck at the pre-sync offset until the next awareness event
    // fires — making every remote cursor appear 1 keystroke behind the typist.
    //
    // By also observing ytext, we re-resolve and re-render remote cursors
    // immediately after each remote document update, using the freshly updated
    // ydoc so the cursor positions are always correct.
    //
    // Local changes (origin === "local") are skipped: for local edits the
    // cursor broadcast listener (below) already handles the update, and the
    // local cursor is never shown as a remote cursor anyway.
    const ytextObserver = (event: Y.YTextEvent) => {
      if (event.transaction.origin === "local") return;
      resolveAndSetRemoteCursors(
        awareness.getStates(),
        ydoc,
        doc,
        localUserId,
        activeClientIds,
      );
    };
    ytext.observe(ytextObserver);

    // Clean up previous cursor-broadcast subscription before re-subscribing.
    // Without this, reconnect() would stack listeners, with stale ones
    // referencing the destroyed awareness instance.
    if (cursorBroadcastUnsubRef.current) {
      cursorBroadcastUnsubRef.current();
      cursorBroadcastUnsubRef.current = null;
    }

    // Viewers are read-only observers — they must not broadcast cursor positions.
    // Their presence (name/color) is already published above and is sufficient
    // for the presence bar on other clients. Skipping this subscription also
    // prevents unnecessary awareness traffic from view-only clients.
    if (!isViewer) {
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

    // Return a cleanup function that removes the ytext observer. The caller
    // is responsible for invoking this before setting up a new wireAwareness
    // (e.g., on reconnect) to avoid stacking observers on the same ytext.
    return () => {
      ytext.unobserve(ytextObserver);
    };
  }, [resolveAndSetRemoteCursors]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("content");

    const provider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
      connect: true,
      params: { ticket },
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

    // ── Gate editor interactivity on initial sync completion ──────────────
    // The ViewModel is only exposed to React after the Yjs sync handshake
    // finishes (SyncStep1 → SyncStep2 round-trip). This ensures the client's
    // Y.Doc contains the full hydrated snapshot before the user can edit.
    // Without this gate, the user would see and edit a blank editor while
    // the sync server is still fetching the snapshot from the api-server.
    provider.on("sync", (synced: boolean) => {
      setIsSynced(synced);
      if (synced) {
        setViewModel(vm);
      }
    });

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

    // Derive viewer status from the ticket so wireAwareness and EditorView can
    // both gate viewer-specific behaviour without a separate round-trip.
    let isViewerSession = false;
    try {
      const [, payloadB64] = ticket.split(".");
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
        if (typeof payload.effectiveRole === "string") {
          useEditorStore.getState().setEffectiveRole(payload.effectiveRole);
          isViewerSession = payload.effectiveRole === "VIEWER";
        }
        if (typeof payload.isMember === "boolean") {
          useEditorStore.getState().setIsMember(payload.isMember);
        }
      }
    } catch {
      // Ignore malformed tickets
    }

    wireAwarenessUnsubRef.current = wireAwareness(
      provider,
      ydoc,
      ytext,
      doc,
      ticket,
      isViewerSession,
    );

    // Register a custom message handler for MSG_PERMISSION_CHANGED (type 5).
    // The sync-server broadcasts this after a permission mutation on the api-server.
    // onRewire re-wires awareness in-place so cursor broadcasting stops/starts
    // without a reconnect (Option B: in-place update, server is the authority).
    registerPermissionChangedHandler(
      provider,
      () => extractUserId(ticket),
      (newIsViewer) => {
        wireAwarenessUnsubRef.current?.();
        wireAwarenessUnsubRef.current = wireAwareness(
          provider,
          ydoc,
          ytext,
          doc,
          ticket,
          newIsViewer,
        );
      },
    );

    // Track connection status for the UI indicator.
    provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s as ConnectionStatus);

      // Each time the provider establishes a new native WebSocket connection,
      // attach a one-shot close listener so we can detect application-level close
      // codes (e.g. 4403 Forbidden from the sync-server). We dispatch a custom DOM
      // event so CollaborationLayout — which has no direct access to the provider —
      // can show a user-friendly banner without prop drilling.
      if (s === "connected") {
        const nativeWs = (provider as unknown as { ws: WebSocket | null }).ws;
        if (nativeWs) {
          const onClose = (evt: CloseEvent) => {
            window.dispatchEvent(
              new CustomEvent("collab:connection-closed", {
                detail: { code: evt.code, reason: evt.reason },
              }),
            );
          };
          nativeWs.addEventListener("close", onClose, { once: true });
        }
      }
    });


    return () => {
      storeUnsubscribe();
      useEditorStore.getState().setLastSavedAt(null);
      wireAwarenessUnsubRef.current?.();
      wireAwarenessUnsubRef.current = null;
      provider.destroy();
      providerRef.current = null;
      setIsSynced(false);
      setViewModel(null);
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
    (newTicket: string) => {
      if (!providerRef.current || !ydocRef.current) {
        return;
      }
      const ydoc = ydocRef.current;
      const ytext = ydoc.getText("content");
      providerRef.current.destroy();

      // Reset sync gate — the new provider will trigger a fresh handshake.
      // Even though the Y.Doc is preserved (and should sync near-instantly),
      // we still gate for correctness.
      setIsSynced(false);
      setViewModel(null);

      const newProvider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
        connect: true,
        params: { ticket: newTicket },
      });
      providerRef.current = newProvider;

      // Re-gate ViewModel exposure on sync completion for the new provider.
      newProvider.on("sync", (synced: boolean) => {
        setIsSynced(synced);
        if (synced && vmRef.current) {
          setViewModel(vmRef.current);
        }
      });

      registerSnapshotSavedHandler(newProvider);

      // Parse the effectiveRole from the new ticket and update the store so
      // that the BottomBar (RoomAccessIndicator) reflects the upgraded role
      // (e.g., GUEST → OWNER) immediately, without requiring a page reload.
      let isViewerReconnect = false;
      try {
        const [, payloadB64] = newTicket.split(".");
        if (payloadB64) {
          const payload = JSON.parse(atob(payloadB64)) as Record<
            string,
            unknown
          >;
          if (typeof payload.effectiveRole === "string") {
            useEditorStore.getState().setEffectiveRole(payload.effectiveRole);
            isViewerReconnect = payload.effectiveRole === "VIEWER";
          }
          if (typeof payload.isMember === "boolean") {
            useEditorStore.getState().setIsMember(payload.isMember);
          }
        }
      } catch {
        // Ignore malformed tokens
      }

      const doc = new CollaborativeDocument(ytext);
      // Clean up the previous ytext observer before registering a new one.
      wireAwarenessUnsubRef.current?.();
      wireAwarenessUnsubRef.current = wireAwareness(
        newProvider,
        ydoc,
        ytext,
        doc,
        newTicket,
        isViewerReconnect,
      );

      // Re-register the permission-changed handler on the new provider.
      registerPermissionChangedHandler(
        newProvider,
        () => extractUserId(newTicket),
        (newIsViewer) => {
          wireAwarenessUnsubRef.current?.();
          wireAwarenessUnsubRef.current = wireAwareness(
            newProvider,
            ydoc,
            ytext,
            doc,
            newTicket,
            newIsViewer,
          );
        },
      );

      newProvider.on("status", ({ status: s }: { status: string }) => {
        setStatus(s as ConnectionStatus);
      });
    },
    [roomId, wireAwareness, wsBaseUrl],
  );

  return { viewModel, status, users, isSynced, reconnect };
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
 * Custom message type matching the sync-server's `MSG_PERMISSION_CHANGED`.
 *
 * Index 5 follows MSG_SNAPSHOT_SAVED.
 */
const MSG_PERMISSION_CHANGED = 5;

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

/**
 * Shape of the JSON payload embedded in a MSG_PERMISSION_CHANGED message.
 */
interface PermissionChangedEvent {
  type: "access_mode_changed" | "member_role_changed" | "member_removed";
  /** Present on access_mode_changed. */
  accessMode?: "PUBLIC_EDIT" | "PUBLIC_VIEW" | "PRIVATE";
  /** Present on member_role_changed — the new role for this user. */
  newRole?: string;
  /** Present on member_role_changed and member_removed — the affected user's UUID. */
  userId?: string;
}

/**
 * Derives the new effective role for the local user when an `access_mode_changed`
 * event arrives, based on the new access mode and the user's current role.
 *
 * Rules:
 * - OWNER and explicit EDITOR/VIEWER members keep their role regardless of access mode.
 * - PUBLIC_EDIT: public (non-member) connections become EDITOR.
 * - PUBLIC_VIEW: public (non-member) connections become VIEWER.
 * - PRIVATE: public connections are disconnected server-side (4403); this function
 *   is not called in that case because the connection is closed before the event lands.
 */
function deriveRoleFromAccessMode(
  currentRole: string | null,
  newAccessMode: string,
  isMember: boolean,
): string {
  // Explicit DB members keep their server-assigned role regardless of access mode.
  if (isMember) return currentRole ?? "VIEWER";
  // Public-access connections re-derive from the new access mode.
  return newAccessMode === "PUBLIC_EDIT" ? "EDITOR" : "VIEWER";
}

/**
 * Registers a custom message handler on the WebsocketProvider for
 * `MSG_PERMISSION_CHANGED` messages broadcast by the sync-server.
 *
 * On receiving the event the handler:
 *   1. Updates `editorStore.effectiveRole` (gating EditorView keyboard/mouse handlers).
 *   2. Updates `editorStore.room.accessMode` (refreshing RoomAccessIndicator).
 *   3. If the viewer status changed, re-wires awareness (stops/starts cursor broadcasting).
 *
 * @param provider     The y-websocket provider instance.
 * @param getLocalUserId Function that returns the current local user's UUID.
 * @param getIsViewer  Getter for the current isViewer flag (mutated after re-wire).
 * @param setIsViewer  Setter to update the mutable isViewer flag.
 * @param onRewire     Callback to re-wire awareness with the new isViewer value.
 */
function registerPermissionChangedHandler(
  provider: WebsocketProvider,
  getLocalUserId: () => string | null,
  onRewire: (isViewer: boolean) => void,
): void {
  (provider as unknown as { messageHandlers: unknown[] }).messageHandlers[
    MSG_PERMISSION_CHANGED
  ] = (_encoder: unknown, decoder: decoding.Decoder): void => {
    const jsonStr = decoding.readVarString(decoder);
    let event: PermissionChangedEvent;
    try {
      event = JSON.parse(jsonStr) as PermissionChangedEvent;
    } catch {
      return; // Malformed payload — ignore
    }

    const store = useEditorStore.getState();

    if (event.type === "access_mode_changed" && event.accessMode) {
      const newAccessMode = event.accessMode;
      // Update the displayed access mode badge immediately.
      store.updateRoomAccessMode(newAccessMode);

      // Re-derive the effective role from the new access mode.
      const currentRole = store.effectiveRole;
      const newRole = deriveRoleFromAccessMode(
        currentRole,
        newAccessMode,
        store.isMember,
      );
      if (newRole !== currentRole) {
        store.setEffectiveRole(newRole);
        const newIsViewer = newRole === "VIEWER";
        // Re-wire awareness so cursor broadcasting is stopped/started as appropriate.
        onRewire(newIsViewer);
      }
    } else if (event.type === "member_role_changed" && event.newRole) {
      // Only apply if this event targets the local user.
      const localUserId = getLocalUserId();
      if (event.userId && event.userId !== localUserId) return;

      const newRole = event.newRole;
      store.setEffectiveRole(newRole);
      store.setIsMember(true);
      const newIsViewer = newRole === "VIEWER";
      onRewire(newIsViewer);
    } else if (event.type === "member_removed") {
      const localUserId = getLocalUserId();
      if (event.userId && event.userId !== localUserId) return;

      // The room is public. The server downgraded us to public guest status.
      // (If the room were PRIVATE, the server would have closed the connection with 4403
      // and this event handler wouldn't have been processed on the client.)
      store.setIsMember(false);
      const currentAccessMode = store.room?.accessMode;
      if (currentAccessMode) {
        const newRole = deriveRoleFromAccessMode(
          store.effectiveRole,
          currentAccessMode,
          false, // no longer a member
        );
        if (newRole !== store.effectiveRole) {
          store.setEffectiveRole(newRole);
          const newIsViewer = newRole === "VIEWER";
          onRewire(newIsViewer);
        }
      }
    }
  };
}
