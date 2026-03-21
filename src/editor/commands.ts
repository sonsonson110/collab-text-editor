import type { Position } from "@/core/position/position";

export type Command =
  | { type: "insert_text"; text: string }
  | { type: "delete_backward" }
  | { type: "delete_forward" }
  | { type: "move_cursor"; direction: "left" | "right" }
  | { type: "move_cursor_to"; position: Position }
  | { type: "select_to"; position: Position };
