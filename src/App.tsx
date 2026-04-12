// import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { EditorView } from "@/ui/EditorView";
import { EditorSetup } from "@/ui/EditorSetup";
import React from "react";
import { INITIAL_TEXT } from "@/constants";
import * as Y from "yjs";
import { CollaborativeDocument } from "@/core/document/collaborativeDocument";

function EditorInstance() {
  const viewModelRef = React.useRef<ViewModel | null>(null);

  if (!viewModelRef.current) {
    // ── Solo mode (default) ─────────────────────────────────────────────────
    // const doc = new Document(INITIAL_TEXT);

    // ── Collaborative mode (Phase 2+) ────────────────────────────────────────
    // Uncomment the block below and comment out the solo line above to switch.
    // A sync provider (y-websocket) will be wired in Phase 2.
    //
    // import * as Y from 'yjs';
    // import { CollaborativeDocument } from '@/core/document/collaborativeDocument';
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    ytext.insert(0, INITIAL_TEXT);
    const doc = new CollaborativeDocument(ytext);
    // Phase 2: const provider = new WebsocketProvider('ws://localhost:1234', 'room-1', ydoc);

    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    // visibleLineCount starts at 1; EditorView's ResizeObserver sets the real value
    viewModelRef.current = new ViewModel(editorState);
  }

  return <EditorView viewModel={viewModelRef.current} />;
}

function App() {
  return (
    <EditorSetup>
      <EditorInstance />
    </EditorSetup>
  );
}

export default App;
