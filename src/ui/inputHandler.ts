import type { Command } from "@/editor/commands";
import type React from "react";

export function mapKeyboardEvent(e: React.KeyboardEvent): Command | null {
  // text input
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    return { type: "insert_text", text: e.key };
  }

  switch (e.key) {
    case "Enter":
      return { type: "insert_text", text: "\n" };

    case "Backspace":
      return { type: "delete_backward" };

    case "Delete":
      return { type: "delete_forward" };

    case "ArrowLeft":
      return { type: "move_cursor", direction: "left" };

    case "ArrowRight":
      return { type: "move_cursor", direction: "right" };

    case "ArrowUp":
      return { type: "move_cursor", direction: "up" };

    case "ArrowDown":
      return { type: "move_cursor", direction: "down" };
  }

  return null;
}
