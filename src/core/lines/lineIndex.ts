import { Position } from "@core/position/position";

interface ILineIndex {
  getLineCount(): number;
  getLineStart(line: number): number;
  positionToOffset(position: Position): number;
  offsetToPosition(offset: number): Position;
}

export class LineIndex implements ILineIndex {
  // lineStarts[i] is the index of the first character of line i+1 in the document text
  // lineStarts[0] = offset of first line
  // lineStarts[1] = offset of second line
  private lineStarts: number[] = [];

  constructor(text: string) {
    this.rebuild(text);
  }

  rebuild(text: string): void {
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        this.lineStarts.push(i + 1);
      }
    }
  }

  getLineCount(): number {
    return this.lineStarts.length;
  }

  getLineStart(line: number): number {
    if (line < 0 || line >= this.lineStarts.length) {
      throw new Error("Line number out of range");
    }
    return this.lineStarts[line];
  }

  positionToOffset(position: Position): number {
    const lineStart = this.getLineStart(position.line);
    return lineStart + position.column;
  }

  offsetToPosition(offset: number): Position {
    if (offset < 0) {
      throw new Error("Offset cannot be negative");
    }

    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.lineStarts[mid] > offset) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const line = high; // the last line whose start is <= offset
    const column = offset - this.lineStarts[line];
    return new Position(line, column);
  }
}
