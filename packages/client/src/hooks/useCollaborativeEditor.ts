import { useCallback, useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
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
   * @param newToken The new Member JWT to connect with.
   */
  reconnect: (newToken: string) => void;
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
 * Returns `{ viewModel, status, users, reconnect }` — the view model is `null`
 * until the provider has connected and the editor state is ready.
 */
export function useCollaborativeEditor({
  roomId,
  token,
}: UseCollaborativeEditorProps): UseCollaborativeEditorResult {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  // Stable refs so reconnect() can access the latest provider/doc/vm without
  // being listed as a useEffect dependency.
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const vmRef = useRef<ViewModel | null>(null);

  // Derive the WS base URL: in dev the Vite proxy rewrites /ws → sync-server.
  // In production Nginx does the same. We never hardcode a port here.
  const wsBaseUrl =
    (import.meta.env.VITE_WS_URL as string | undefined) ?? `${window.location.origin.replace(/^http/, "ws")}/ws`;

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("content");

    const provider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
      connect: true,
      params: { token },
    });
    providerRef.current = provider;
    const awareness = provider.awareness;

    // Assign a random display identity for the presence bar.
    const name = `User ${Math.floor(Math.random() * 1000)}`;
    const color =
      REMOTE_CURSOR_COLORS[
        Math.floor(Math.random() * REMOTE_CURSOR_COLORS.length)
      ]!;
    awareness.setLocalStateField("user", { name, color });

    const doc = new CollaborativeDocument(ytext);

    /**
     * Derive the connected-user list and remote cursor positions from the
     * awareness states. Called on every awareness `change` event.
     */
    awareness.on("change", () => {
      const states = awareness.getStates();
      const cursors: RemoteCursorAbsolute[] = [];
      const connectedUsers: ConnectedUser[] = [];

      states.forEach((state: Record<string, unknown>, clientID: number) => {
        const userInfo = state["user"] as
          | { name: string; color: string }
          | undefined;
        if (!userInfo) {
          return;
        }

        connectedUsers.push({
          clientID,
          name: userInfo.name,
          color: userInfo.color,
          isLocal: clientID === ydoc.clientID,
        });

        if (clientID === ydoc.clientID) {
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

    // Track connection status for the UI indicator.
    provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s as ConnectionStatus);
    });

    const cursor = new Cursor(new Position(0, 0));
    const undoManager = new YjsUndoManager(ytext);
    const editorState = new EditorState(doc, cursor, undoManager, ydoc, ytext);

    // Broadcast local cursor position to peers after every state change.
    editorState.subscribe(() => {
      const activeCursor = editorState.getCursor();
      broadcastCursor(
        awareness,
        ytext,
        doc,
        activeCursor.anchor,
        activeCursor.active,
      );
    });

    const vm = new ViewModel(editorState);
    vmRef.current = vm;
    setViewModel(vm);

    return () => {
      provider.destroy();
      providerRef.current = null;
    };
  }, [roomId, token, wsBaseUrl]);

  /**
   * Swaps the WebSocket provider to use a new token, preserving the Y.Doc.
   * Call this after a guest claims a room and receives a Member JWT.
   */
  const reconnect = useCallback(
    (newToken: string) => {
      if (!providerRef.current || !ydocRef.current) {
        return;
      }
      const ydoc = ydocRef.current;
      providerRef.current.destroy();

      const newProvider = new WebsocketProvider(wsBaseUrl, roomId, ydoc, {
        connect: true,
        params: { token: newToken },
      });
      providerRef.current = newProvider;

      newProvider.on("status", ({ status: s }: { status: string }) => {
        setStatus(s as ConnectionStatus);
      });
    },
    [roomId, wsBaseUrl],
  );

  return { viewModel, status, users, reconnect };
}
