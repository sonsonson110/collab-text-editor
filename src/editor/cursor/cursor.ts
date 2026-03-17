import type { Position } from "@/core/position/position";
import { Range } from "@core/position/range";

interface ICursor {
  isCollapsed(): boolean;
  getStart(): Position;
  getEnd(): Position;
  toRange(): Range;
}

export class Cursor implements ICursor {
  anchor: Position;
  active: Position;

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

  toRange(): Range {
    return new Range(this.anchor, this.active);
  }
}
