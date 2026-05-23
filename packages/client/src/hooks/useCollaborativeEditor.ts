import { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { INITIAL_TEXT, LINE_HEIGHT } from "@/constants";
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

const WS_URL = import.meta.env.VITE_WS_URL as string;
const ROOM_NAME = import.meta.env.VITE_ROOM_NAME as string;

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

/**
 * Bootstraps the entire collaborative editing session.
 *
 * Creates the Yjs document, WebSocket provider, editor state, and view model,
 * then wires up awareness broadcasting and remote-cursor collection.
 *
 * Returns `{ viewModel, status, users }` — the view model is `null` until the
 * provider has connected and the editor state is ready.
 */
export function useCollaborativeEditor() {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");

    const provider = new WebsocketProvider(WS_URL, ROOM_NAME, ydoc);
    const awareness = provider.awareness;

    // Assign a random identity so other clients can label this user's cursor.
    const name = `User ${Math.floor(Math.random() * 1000)}`;
    const color =
      REMOTE_CURSOR_COLORS[
        Math.floor(Math.random() * REMOTE_CURSOR_COLORS.length)
      ];
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
        const userInfo = state.user as
          | { name: string; color: string }
          | undefined;
        if (!userInfo) return;

        connectedUsers.push({
          clientID,
          name: userInfo.name,
          color: userInfo.color,
          isLocal: clientID === ydoc.clientID,
        });

        if (clientID === ydoc.clientID) return;

        const cursorState = state.cursor as
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

      vm.setRemoteCursors(cursors);

      // Reserve top padding when any remote cursor head sits on line 0 so
      // the cursor label is not clipped above the viewport. Zeroing the
      // reservation (rather than removing the key) lets other reservations
      // still contribute via max().
      const hasRemoteOnLine0 = cursors.some((c) => c.head.line === 0);
      vm.reserveTopPadding(
        TOP_PADDING_RESERVATION_KEYS.REMOTE_CURSOR_LINE_0,
        hasRemoteOnLine0 ? LINE_HEIGHT : 0,
      );

      setUsers(connectedUsers);
    });

    // Seed with initial content only when this is the first client in the room.
    // After sync, if the document is empty no one else has typed yet — safe to seed.
    provider.on("sync", (synced: boolean) => {
      if (synced && ytext.toString() === "") {
        ytext.insert(0, INITIAL_TEXT);
      }
    });

    // Track connection status for the UI indicator.
    provider.on("status", ({ status }: { status: string }) => {
      setStatus(status as ConnectionStatus);
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
    setViewModel(vm);

    // Destroy the provider when the component unmounts to close the WebSocket cleanly.
    // This perfectly handles React 18 Strict Mode double-mounts.
    return () => {
      provider.destroy();
    };
  }, []);

  return { viewModel, status, users };
}
