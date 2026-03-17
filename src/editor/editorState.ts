import type { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";

interface IEditorState {
  setCursor(cursor: Cursor): void;
  insert(text: string): void;
  deleteSelection(): void;
}

export class EditorState implements IEditorState {
  document: Document;
  cursor: Cursor;

  constructor(doc: Document, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }

  setCursor(cursor: Cursor): void {
    this.cursor = cursor;
  }

  // TODO: Handle multi-line selections and complex insertions
  insert(text: string): void {
    const range = this.cursor.toRange();
    this.document.replace(range, text);

    // Move cursor to the end of the replaced text
    this.cursor = this.cursor.moveTo(
      new Position(range.start.line, range.start.column + text.length),
    );
  }

  deleteSelection(): void {
    const range = this.cursor.toRange();
    this.document.delete(range);
    // Move cursor to the start of the deleted range
    this.cursor = this.cursor.moveTo(range.start);
  }
}
