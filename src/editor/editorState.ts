import type { Document } from "@/core/document/document";
import { Cursor } from "@/editor/cursor/cursor";
import { Range } from "@core/position/range";

export interface IEditorState {
  setCursor(cursor: Cursor): void;
  getCursor(): Cursor;
  insert(text: string): void;
  delete(): void;
  getLineCount(): number;
  getLineContent(line: number): string;
}

export class EditorState implements IEditorState {
  private document: Document;
  private cursor: Cursor;

  constructor(doc: Document, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }

  setCursor(cursor: Cursor): void {
    this.cursor = cursor;
  }

  getCursor(): Cursor {
    return this.cursor;
  }

  // TODO: Handle multi-line selections and complex insertions
  insert(text: string): void {
    const range = this.cursor.toRange();
    this.document.replace(range, text);
    this.moveCursorAfterInsert(range, text);
  }

  private moveCursorAfterInsert(range: Range, text: string): void {
    const startOffset = this.document.getOffsetAt(range.start);
    const newOffset = startOffset + text.length;
    const newPosition = this.document.getPositionAt(newOffset);
    this.cursor = this.cursor.moveTo(newPosition);
  }

  delete(): void {
    const range = this.cursor.toRange();
    this.document.delete(range);
    // Move cursor to the start of the deleted range
    this.cursor = this.cursor.moveTo(range.start);
  }

  getLineCount(): number {
    return this.document.getLineCount();
  }

  getLineContent(line: number): string {
    return this.document.getLineContent(line);
  }
}
