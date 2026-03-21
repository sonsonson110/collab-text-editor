import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";
import { EditorView } from "@/ui/EditorView";

function App() {
  const doc = new Document(
    "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10",
  );
  const cursor = new Cursor(new Position(0, 1));
  const editor = new EditorState(doc, cursor);
  const viewModel = new ViewModel(editor, 0, 10);

  return <EditorView viewModel={viewModel} editor={editor} />;
}

export default App;
