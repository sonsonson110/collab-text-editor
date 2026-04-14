import { INITIAL_TEXT } from "@/constants";
import { CollaborativeDocument } from "@/core/document/collaborativeDocument";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ConnectionIndicator, type ConnectionStatus } from "@/ui/components";
import { EditorSetup } from "@/ui/EditorSetup";
import { EditorView } from "@/ui/EditorView";
import { ViewModel } from "@/view/viewModel";
import { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const WS_URL = import.meta.env.VITE_WS_URL as string;
const ROOM_NAME = import.meta.env.VITE_ROOM_NAME as string;

function EditorInstance() {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");

    // Connect to the collaboration server.
    const provider = new WebsocketProvider(WS_URL, ROOM_NAME, ydoc);

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

    const doc = new CollaborativeDocument(ytext);
    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);

    setViewModel(new ViewModel(editorState));

    // Destroy the provider when the component unmounts to close the WebSocket cleanly.
    // This perfectly handles React 18 Strict Mode double-mounts.
    return () => {
      provider.destroy();
    };
  }, []);

  if (!viewModel) return <ConnectionIndicator status={status} />;

  return (
    <>
      <EditorView viewModel={viewModel} />
      <ConnectionIndicator status={status} />
    </>
  );
}

function App() {
  return (
    <EditorSetup>
      <EditorInstance />
    </EditorSetup>
  );
}

export default App;
