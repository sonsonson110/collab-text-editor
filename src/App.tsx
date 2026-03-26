import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { EditorView } from "@/ui/EditorView";
import React from "react";
import { INITIAL_TEXT, VISIBLE_LINE_COUNT } from "@/constants";

function App() {
  const viewModelRef = React.useRef<ViewModel | null>(null);

  if (!viewModelRef.current) {
    const doc = new Document(INITIAL_TEXT);
    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    viewModelRef.current = new ViewModel(editorState, 0, VISIBLE_LINE_COUNT);
  }

  return <EditorView viewModel={viewModelRef.current} />;
}

export default App;
