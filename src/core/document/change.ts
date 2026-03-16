import type { Range } from "@core/position/range";

export interface Change {
  range: Range;
  insertedText: string;
}
