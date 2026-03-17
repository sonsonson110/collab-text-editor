import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";
import { EditorState } from "@/editor/editorState";

const rawText = "Hello\nWorld\nEditor";
const doc = new Document(rawText);
let cursor = new Cursor(new Position(0, 0));
const editor = new EditorState(doc, cursor);

console.log("Initial text:");
console.log(editor.document.getText());

const offset = 8;
const position = editor.document.getPositionAt(offset);
console.log(`Position at offset ${offset}:`, position);
console.log("Text at position:", editor.document.getText()[offset]);

const insertPosition = editor.cursor.getStart();
editor.document.insert(insertPosition, "!");
console.log("Text after change:");
console.log(editor.document.getText());

cursor = new Cursor(new Position(2, 0), new Position(2, 10));
editor.document.replace(cursor.toRange(), "New Editor");
console.log("Text after replacement:");
console.log(editor.document.getText());
