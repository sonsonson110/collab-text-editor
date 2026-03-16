import { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";

const rawText = "Hello\nWorld\nEditor";
const doc = new Document(rawText);

console.log("Initial text:");
console.log(doc.getText());

const offset = 8;
const position = doc.getPositionAt(offset);
console.log(`Position at offset ${offset}:`, position);
console.log("Text at position:", doc.getText()[offset]);

const insertPosition = new Position(1, 5);
doc.insert(insertPosition, "!");
console.log("Text after change:");
console.log(doc.getText());
