import type { Position } from "@/core/position/position";
import { Range } from "@core/position/range";

interface ICursor {
  isCollapsed(): boolean;
  getStart(): Position;
  getEnd(): Position;
  getCurrent(): Position;
  toRange(): Range;
  moveTo(position: Position): Cursor;
  setActive(position: Position): Cursor;
  collapseToStart(): Cursor;
  collapseToEnd(): Cursor;
}

export class Cursor implements ICursor {
  readonly anchor: Position;
  readonly active: Position;

  constructor(anchor: Position, active?: Position) {
    this.anchor = anchor;
    this.active = active ?? anchor;
  }

  // Checks if the cursor is a single point (no selection)
  isCollapsed(): boolean {
    return this.anchor.isEqual(this.active);
  }

  getStart(): Position {
    return this.anchor.isBefore(this.active) ? this.anchor : this.active;
  }

  getEnd(): Position {
    return this.anchor.isAfter(this.active) ? this.anchor : this.active;
  }

  // Returns the current position of the cursor (active if there's a selection, otherwise anchor)
  getCurrent(): Position {
    return this.active ?? this.anchor;
  }

  toRange(): Range {
    return new Range(this.anchor, this.active);
  }

  moveTo(position: Position): Cursor {
    return new Cursor(position);
  }

  setActive(position: Position): Cursor {
    return new Cursor(this.anchor, position);
  }

  collapseToStart(): Cursor {
    return new Cursor(this.getStart());
  }

  collapseToEnd(): Cursor {
    return new Cursor(this.getEnd());
  }
}
