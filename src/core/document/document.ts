import type { Change } from "@/core/document/change";
import { LineIndex } from "@/core/lines/lineIndex";
import type { Position } from "@/core/position/position";
import { Range } from "@core/position/range";

interface IDocument {
  getText(): string;
  getLineCount(): number;
  insert(position: Position, text: string): void;
  delete(range: Range): void;
  replace(range: Range, newText: string): void;
  getPositionAt(offset: number): Position;
  getOffsetAt(position: Position): number;
  getLineContent(line: number): string;
  getLineLength(line: number): number;
  getTextInRange(range: Range): string;
}

// Central API for document management
export class Document implements IDocument {
  private text: string;
  private lineIndex: LineIndex;

  constructor(initialText: string = "") {
    this.text = initialText;
    this.lineIndex = new LineIndex(initialText);
  }

  getText(): string {
    return this.text;
  }

  getLineCount(): number {
    return this.lineIndex.getLineCount();
  }

  insert(position: Position, text: string): void {
    const range = new Range(position, position);
    const change: Change = { range, insertedText: text };
    this.applyChange(change);
  }

  delete(range: Range): void {
    const change: Change = { range, insertedText: "" };
    this.applyChange(change);
  }

  replace(range: Range, newText: string): void {
    const change: Change = { range, insertedText: newText };
    this.applyChange(change);
  }

  private applyChange(change: Change): void {
    const startOffset = this.getOffsetAt(change.range.start);
    const endOffset = this.getOffsetAt(change.range.end);

    this.text =
      this.text.slice(0, startOffset) +
      change.insertedText +
      this.text.slice(endOffset);

    this.lineIndex.rebuild(this.text);
  }

  getPositionAt(offset: number): Position {
    return this.lineIndex.offsetToPosition(offset);
  }

  getOffsetAt(position: Position): number {
    return this.lineIndex.positionToOffset(position);
  }

  getLineContent(line: number): string {
    const lineStart = this.lineIndex.getLineStart(line);
    const totalLines = this.lineIndex.getLineCount();
    const nextLineStart =
      line + 1 < totalLines
        ? this.lineIndex.getLineStart(line + 1)
        : this.getText().length;
    // Removes the trailing newline (if present) by replacing it with an empty string
    return this.text.slice(lineStart, nextLineStart).replace(/\n$/, "");
  }

  getLineLength(line: number): number {
    return this.getLineContent(line).length;
  }

  getTextInRange(range: Range): string {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    const result = this.text.slice(startOffset, endOffset);
    return result;
  }
}
