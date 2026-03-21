import type { Document } from "@/core/document/document";
import type { Position } from "@/core/position/position";
import type { Command } from "@/editor/commands";
import { Cursor } from "@/editor/cursor/cursor";
import { Range } from "@core/position/range";

export interface IEditorState {
  getCursor(): Cursor;
  getLineCount(): number;
  getLineContent(line: number): string;
  execute(command: Command): void;
}

export class EditorState implements IEditorState {
  private document: Document;
  private cursor: Cursor;

  constructor(doc: Document, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }

  private setCursor(cursor: Cursor): void {
    this.cursor = cursor;
  }

  getCursor(): Cursor {
    return this.cursor;
  }

  private insert(text: string): void {
    const range = this.cursor.toRange();
    this.document.replace(range, text);

    const startOffset = this.document.getOffsetAt(range.start);
    const newOffset = startOffset + text.length;
    const newPosition = this.document.getPositionAt(newOffset);
    this.cursor = this.cursor.moveTo(newPosition);
  }

  private deleteBackward(): void {
    const range = this.cursor.toRange();

    if (!range.isEmpty()) {
      this.document.delete(range);
      this.cursor = this.cursor.moveTo(range.start);
      return;
    }
    const currentCursor = this.cursor;
    if (currentCursor.isAtStart()) {
      return;
    }

    const prevOffset = this.document.getOffsetAt(currentCursor.active) - 1;
    const prevPosition = this.document.getPositionAt(prevOffset);
    const deleteRange = new Range(prevPosition, currentCursor.active);
    this.document.delete(deleteRange);
    this.cursor = this.cursor.moveTo(prevPosition);
  }

  private deleteForward(): void {
    const range = this.cursor.toRange();

    if (!range.isEmpty()) {
      this.document.delete(range);
      this.cursor = this.cursor.moveTo(range.start);
      return;
    }
    const currentCursor = this.cursor;
    const documentLength = this.document.getLength();
    if (this.document.getOffsetAt(currentCursor.active) >= documentLength) {
      return;
    }

    const nextOffset = this.document.getOffsetAt(currentCursor.active) + 1;
    const nextPosition = this.document.getPositionAt(nextOffset);
    const deleteRange = new Range(currentCursor.active, nextPosition);
    this.document.delete(deleteRange);
    this.cursor = this.cursor.moveTo(currentCursor.active);
  }

  moveCursor(direction: "left" | "right"): void {
    const cursor = this.cursor;

    // collapse selection if exists
    if (!cursor.isCollapsed()) {
      this.cursor =
        direction === "left"
          ? cursor.collapseToStart()
          : cursor.collapseToEnd();
      return;
    }

    const current = cursor.getCurrent();
    const offset = this.document.getOffsetAt(current);

    if (direction === "left" && offset > 0) {
      const newPos = this.document.getPositionAt(offset - 1);
      this.cursor = cursor.moveTo(newPos);
    }

    if (direction === "right" && offset < this.document.getLength()) {
      const newPos = this.document.getPositionAt(offset + 1);
      this.cursor = cursor.moveTo(newPos);
    }
  }

  private expandSelection(position: Position): void {
    this.cursor = this.cursor.setActive(position);
  }

  getLineCount(): number {
    return this.document.getLineCount();
  }

  getLineContent(line: number): string {
    return this.document.getLineContent(line);
  }

  execute(command: Command): void {
    switch (command.type) {
      case "insert_text":
        this.insert(command.text);
        break;

      case "delete_backward":
        this.deleteBackward();
        break;

      case "delete_forward":
        this.deleteForward();
        break;

      case "move_cursor":
        this.moveCursor(command.direction);
        break;

      case "move_cursor_to":
        this.setCursor(new Cursor(command.position));
        break;

      case "select_to":
        this.expandSelection(command.position);
        break;
    }
  }
}
