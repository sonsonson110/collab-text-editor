import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { EditorView } from "@/ui/EditorView";
import React from "react";
import { INITIAL_TEXT } from "@/constants";

function App() {
  const viewModelRef = React.useRef<ViewModel | null>(null);

  if (!viewModelRef.current) {
    const doc = new Document(INITIAL_TEXT);
    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    // visibleLineCount starts at 1; EditorView's ResizeObserver sets the real value
    viewModelRef.current = new ViewModel(editorState, 0, 1);
  }

  return <EditorView viewModel={viewModelRef.current} />;
}

export default App;
