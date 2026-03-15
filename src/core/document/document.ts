import type { Change } from "@/core/document/change";
import { LineIndex } from "@/core/lines/lineIndex";
import type { Position } from "@/core/position/position";

// Central API for document management
export class Document {
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

  applyChange(change: Change): void {
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
}
