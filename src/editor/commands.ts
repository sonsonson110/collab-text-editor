import type { Position } from "@/core/position/position";

export type CursorDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "lineStart"
  | "lineEnd"
  | "documentStart"
  | "documentEnd"
  | "wordLeft"
  | "wordRight";

export type Command =
  | { type: "insert_text"; text: string }
  | { type: "delete_backward"; granularity?: "word" }
  | { type: "delete_forward"; granularity?: "word" }
  | {
      type: "move_cursor";
      direction: CursorDirection;
      select?: boolean;
    }
  | { type: "move_cursor_to"; position: Position }
  | { type: "select_to"; position: Position }
  | { type: "select_all" }
  | { type: "undo" }
  | { type: "redo" };
