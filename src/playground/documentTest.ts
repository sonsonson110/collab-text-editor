import { Document } from "@/core/document/document";
import { insertText } from "@/core/document/operation";
import { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

const rawText = "Hello\nWorld\nEditor";
const doc = new Document(rawText);

console.log("Initial text:");
console.log(doc.getText());

const offset = 8;
const position = doc.getPositionAt(offset);
console.log(`Position at offset ${offset}:`, position);
console.log("Text at position:", doc.getText()[offset]);

const newText = "Beautiful ";
const change = insertText(
  new Range(new Position(1, 0), new Position(1, 0)),
  newText,
);
doc.applyChange(change);
console.log("Text after change:");
console.log(doc.getText());
