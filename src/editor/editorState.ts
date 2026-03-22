import type { IDocument } from "@/core/document/document";
import { Position } from "@/core/position/position";
import type { Command } from "@/editor/commands";
import { Cursor } from "@/editor/cursor/cursor";
import { Range } from "@core/position/range";

export interface IEditorState {
  getCursor(): Cursor;
  getLineCount(): number;
  getLineContent(line: number): string;
  execute(command: Command): void;
  subscribe(listener: () => void): () => void;
}

export class EditorState implements IEditorState {
  private document: IDocument;
  private cursor: Cursor;
  private listeners = new Set<() => void>();

  constructor(doc: IDocument, cursor: Cursor) {
    this.document = doc;
    this.cursor = cursor;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
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

  moveCursor(direction: "left" | "right" | "up" | "down"): void {
    const cursor = this.cursor;

    // collapse selection if exists
    if (!cursor.isCollapsed()) {
      this.cursor =
        direction === "left"
          ? cursor.collapseToStart()
          : cursor.collapseToEnd();
      return;
    }

    const current = cursor.active;
    const offset = this.document.getOffsetAt(current);

    switch (direction) {
      case "left":
        if (offset > 0) {
          const newPos = this.document.getPositionAt(offset - 1);
          this.cursor = cursor.moveTo(newPos);
        }
        break;

      case "right":
        if (offset < this.document.getLength()) {
          const newPos = this.document.getPositionAt(offset + 1);
          this.cursor = cursor.moveTo(newPos);
        }
        break;

      case "up": {
        const currentLine = current.line;
        if (currentLine > 0) {
          const nextLineLength = this.document.getLineLength(currentLine - 1);
          const newPos = new Position(
            currentLine - 1,
            Math.min(current.column, nextLineLength),
          );
          this.cursor = cursor.moveTo(newPos);
        }
        break;
      }

      case "down": {
        const currentLine = current.line;
        if (currentLine < this.document.getLineCount() - 1) {
          const nextLineLength = this.document.getLineLength(currentLine + 1);
          const newPos = new Position(
            currentLine + 1,
            Math.min(current.column, nextLineLength),
          );
          this.cursor = cursor.moveTo(newPos);
        }
        break;
      }
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
    this.notifyListeners();
  }
}
