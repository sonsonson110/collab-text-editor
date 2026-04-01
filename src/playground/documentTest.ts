import { LINE_HEIGHT } from "@/constants";
import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";
import { ViewModel } from "@/view/viewModel";

const rawText =
  "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10";
const doc = new Document(rawText);
const cursor = new Cursor(new Position(0, 0));
const editor = new EditorState(doc, cursor);
const viewModel = new ViewModel(editor);

console.log("Initial visible lines:", viewModel.getVisibleLines());
viewModel.scrollBy(0, 2 * LINE_HEIGHT);
console.log("After scrolling down 2 lines:", viewModel.getVisibleLines());
viewModel.scrollBy(0, -1 * LINE_HEIGHT);
console.log("After scrolling up 1 line:", viewModel.getVisibleLines());
