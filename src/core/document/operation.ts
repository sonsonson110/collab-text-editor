import type { Change } from "@/core/document/change";
import type { Range } from "@core/position/range";

export function insertText(range: Range, text: string): Change {
  return {
    range,
    insertedText: text,
    removedText: "",
  };
}

export function deleteText(range: Range, removedText: string): Change {
  return {
    range,
    insertedText: "",
    removedText,
  };
}

export function replaceText(
  range: Range,
  newText: string,
  oldText: string,
): Change {
  return {
    range,
    insertedText: newText,
    removedText: oldText,
  };
}
