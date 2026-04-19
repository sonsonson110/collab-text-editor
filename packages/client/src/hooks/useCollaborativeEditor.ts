import { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { INITIAL_TEXT } from "@/constants";
import { CollaborativeDocument } from "@/core/document/collaborativeDocument";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { broadcastCursor, type RemoteCursorAbsolute } from "@/collaboration/awareness";
import { YjsUndoManager } from "@/collaboration/yjsUndoManager";
import type { ConnectionStatus } from "@/ui/components";

const WS_URL = import.meta.env.VITE_WS_URL as string;
const ROOM_NAME = import.meta.env.VITE_ROOM_NAME as string;

/** Palette used to assign each remote collaborator a distinct cursor color. */
const REMOTE_CURSOR_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#ffeaa7', '#dfe6e9', '#fd79a8', '#6c5ce7',
];

/**
 * Bootstraps the entire collaborative editing session.
 *
 * Creates the Yjs document, WebSocket provider, editor state, and view model,
 * then wires up awareness broadcasting and remote-cursor collection.
 *
 * Returns `{ viewModel, status }` — the view model is `null` until the
 * provider has connected and the editor state is ready.
 */
export function useCollaborativeEditor() {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");

    const provider = new WebsocketProvider(WS_URL, ROOM_NAME, ydoc);
    const awareness = provider.awareness;

    // Assign a random identity so other clients can label this user's cursor.
    const name = `User ${Math.floor(Math.random() * 1000)}`;
    const color = REMOTE_CURSOR_COLORS[Math.floor(Math.random() * REMOTE_CURSOR_COLORS.length)];
    awareness.setLocalStateField('user', { name, color });

    const doc = new CollaborativeDocument(ytext);

    // Collect remote cursor positions whenever any peer's awareness changes.
    awareness.on('change', () => {
      const states = awareness.getStates();
      const cursors: RemoteCursorAbsolute[] = [];

      states.forEach((state: any, clientID: number) => {
        if (clientID === ydoc.clientID) return;

        if (state.cursor && state.user) {
          const anchorAbs = Y.createAbsolutePositionFromRelativePosition(state.cursor.anchor, ydoc);
          const headAbs = Y.createAbsolutePositionFromRelativePosition(state.cursor.head, ydoc);

          if (anchorAbs && headAbs) {
            cursors.push({
              clientID,
              user: state.user,
              anchor: doc.getPositionAt(anchorAbs.index),
              head: doc.getPositionAt(headAbs.index),
            });
          }
        }
      });
      vm.setRemoteCursors(cursors);
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
      broadcastCursor(awareness, ytext, doc, activeCursor.anchor, activeCursor.active);
    });

    const vm = new ViewModel(editorState);
    setViewModel(vm);

    // Destroy the provider when the component unmounts to close the WebSocket cleanly.
    // This perfectly handles React 18 Strict Mode double-mounts.
    return () => {
      provider.destroy();
    };
  }, []);

  return { viewModel, status };
}
