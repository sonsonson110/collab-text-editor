import { Document } from "@/core/document/document";
import { insertText } from "@/core/document/operation";
import { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

const doc = new Document("Line1\nLine 2\nLine 3");

const range = new Range(new Position(0, 0), new Position(0, 0));

const change = insertText(range, "\n!");

doc.applyChange(change);

console.log(doc.getText());
console.log("Lines:", doc.getLineCount());
