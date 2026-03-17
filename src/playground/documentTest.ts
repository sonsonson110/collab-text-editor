import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";

const rawText = "Hello\nWorld\nEditor";
const doc = new Document(rawText);
const cursor = new Cursor(new Position(0, 0));
const editor = new EditorState(doc, cursor);

console.log("Initial text:");
console.log(editor.document.getText());

editor.insert("!");
console.log("Text after change:");
console.log(editor.document.getText());
console.log("Cursor position after replacement:", editor.cursor);

editor.cursor = new Cursor(new Position(2, 0), new Position(2, 10));
editor.replaceSelection("New Editor");
console.log("Text after replacement:");
console.log(editor.document.getText());
console.log("Cursor position after replacement:", editor.cursor);
