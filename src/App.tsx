import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { EditorView } from "@/ui/EditorView";
import React from "react";

const INITIAL_TEXT = `Lorem ipsum dolor sit amet, consectetuer adipiscing elit.
Aenean commodo ligula eget dolor.
Aenean massa.
Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.
Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem.
Nulla consequat massa quis enim.
Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu.
In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo.
Nullam dictum felis eu pede mollis pretium.
Integer tincidunt. Cras dapibus.
Vivamus elementum semper nisi.
Aenean vulputate eleifend tellus.
Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim.
Aliquam lorem ante, dapibus in, viverra quis, feugiat a,`;

const VISIBLE_LINE_COUNT = 10;

function App() {
  const editorRef = React.useRef<EditorState | null>(null);
  const viewModelRef = React.useRef<ViewModel | null>(null);

  if (!editorRef.current) {
    const doc = new Document(INITIAL_TEXT);
    const cursor = new Cursor(new Position(0, 0));
    editorRef.current = new EditorState(doc, cursor);
  }

  if (!viewModelRef.current) {
    viewModelRef.current = new ViewModel(
      editorRef.current,
      0,
      VISIBLE_LINE_COUNT,
    );
  }

  return (
    <EditorView viewModel={viewModelRef.current} editor={editorRef.current} />
  );
}

export default App;
