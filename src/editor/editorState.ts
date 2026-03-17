import type { Document } from "@/core/document/document";
import { Position } from "@/core/position/position";
import { Cursor } from "@/editor/cursor/cursor";

interface IEditorState {
  insert(text: string): void;
  replaceSelection(newText: string): void;
  deleteSelection(): void;
}

export class EditorState implements IEditorState {
  document: Document;
  cursor: Cursor;

  constructor(doc: Document, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }

  insert(text: string): void {
    const position = this.cursor.getStart();
    this.document.insert(position, text);

    // Move cursor after the inserted text
    const newCursor = this.cursor.moveTo(
      new Position(position.line, position.column + text.length),
    );
    this.cursor = newCursor;
  }

  replaceSelection(newText: string): void {
    const range = this.cursor.toRange();
    this.document.replace(range, newText);

    // Move cursor to the end of the replaced text
    const newCursor = this.cursor.moveTo(
      new Position(range.start.line, range.start.column + newText.length),
    );
    this.cursor = newCursor;
  }

  deleteSelection(): void {
    const range = this.cursor.toRange();
    this.document.delete(range);
    // Move cursor to the start of the deleted range
    this.cursor = this.cursor.moveTo(range.start);
  }
}
