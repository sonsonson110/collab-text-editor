import type { Command } from "@/editor/commands";
import type React from "react";

export function mapKeyboardEvent(e: React.KeyboardEvent): Command | null {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    return e.shiftKey ? { type: "redo" } : { type: "undo" };
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    return { type: "redo" };
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    return { type: "select_all" };
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
    return { type: "move_cursor", direction: "documentStart", select: e.shiftKey };
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "End") {
    return { type: "move_cursor", direction: "documentEnd", select: e.shiftKey };
  }

  // text input
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    return { type: "insert_text", text: e.key };
  }

  const isShift = e.shiftKey;

  switch (e.key) {
    case "Enter":
      return { type: "insert_text", text: "\n" };

    case "Backspace":
      return {
        type: "delete_backward",
        granularity: e.ctrlKey || e.metaKey ? "word" : undefined,
      };

    case "Delete":
      return {
        type: "delete_forward",
        granularity: e.ctrlKey || e.metaKey ? "word" : undefined,
      };

    case "Home":
      return { type: "move_cursor", direction: "lineStart", select: isShift };

    case "End":
      return { type: "move_cursor", direction: "lineEnd", select: isShift };

    case "ArrowLeft":
      return {
        type: "move_cursor",
        direction: e.ctrlKey || e.metaKey ? "wordLeft" : "left",
        select: isShift,
      };

    case "ArrowRight":
      return {
        type: "move_cursor",
        direction: e.ctrlKey || e.metaKey ? "wordRight" : "right",
        select: isShift,
      };

    case "ArrowUp":
      return { type: "move_cursor", direction: "up", select: isShift };

    case "ArrowDown":
      return { type: "move_cursor", direction: "down", select: isShift };
  }

  return null;
}

export interface SelectionRect {
  /** Viewport-relative line index */
  line: number;
  /** Start column (inclusive) */
  startCol: number;
  /** End column (exclusive). null means "extend to end of line + 1ch" */
  endCol: number | null;
}

/**
 * Computes the list of per-line SelectionRects from the cursor's anchor/active
 * positions (already in viewport-relative coordinates).
 *
 * @param anchor  Viewport-relative {line, column} of the selection anchor
 * @param active  Viewport-relative {line, column} of the selection active end
 * @param getLineLength  Returns the character length of a given viewport-relative line
 * @param visibleLineCount Number of visible lines in the viewport
 */
export function buildSelectionRects(
  anchor: { line: number; column: number },
  active: { line: number; column: number },
  getLineLength: (viewportLine: number) => number,
  visibleLineCount: number,
): SelectionRect[] {
  // Normalise so startPos is always the earlier position
  const startPos =
    anchor.line < active.line ||
    (anchor.line === active.line && anchor.column <= active.column)
      ? anchor
      : active;
  const endPos = startPos === anchor ? active : anchor;

  if (startPos.line === endPos.line) {
    if (startPos.line < 0 || startPos.line >= visibleLineCount) {
      return [];
    }
    // Single-line selection
    if (startPos.column === endPos.column) {
      return []; // collapsed
    }
    return [
      {
        line: startPos.line,
        startCol: startPos.column,
        endCol: endPos.column,
      },
    ];
  }

  const rects: SelectionRect[] = [];

  // Identify visible range
  const firstVisible = Math.max(0, startPos.line);
  const lastVisible = Math.min(visibleLineCount - 1, endPos.line);

  for (let l = firstVisible; l <= lastVisible; l++) {
    let startCol = 0;
    let endCol = getLineLength(l) + 1; // +1 to cover newline glyph visually

    if (l === startPos.line) {
      startCol = startPos.column;
    }
    if (l === endPos.line) {
      endCol = endPos.column;
    }

    // Don't render empty rects for the last line if selection ends at column 0
    if (l === endPos.line && endCol === 0) {
      continue;
    }

    rects.push({
      line: l,
      startCol,
      endCol,
    });
  }

  return rects;
}

export function getWordSelection(
  lineContent: string,
  column: number,
): { start: number; end: number } {
  if (lineContent.length === 0) {
    return { start: 0, end: 0 };
  }

  let col = column;
  // If clicked beyond the end of the line, clamp to the last character
  if (col >= lineContent.length) {
    col = lineContent.length - 1;
  }

  const char = lineContent[col];
  const isWordChar = (c: string) => /[\w]/.test(c);
  const isWhitespace = (c: string) => /\s/.test(c);

  let type: "word" | "whitespace" | "other";
  if (isWordChar(char)) {
    type = "word";
  } else if (isWhitespace(char)) {
    type = "whitespace";
  } else {
    type = "other";
  }

  const matchesType = (c: string) => {
    if (type === "word") return isWordChar(c);
    if (type === "whitespace") return isWhitespace(c);
    return false;
  };

  let startCol = col;
  let endCol = col;

  while (startCol > 0 && matchesType(lineContent[startCol - 1])) {
    startCol--;
  }
  while (
    endCol < lineContent.length - 1 &&
    matchesType(lineContent[endCol + 1])
  ) {
    endCol++;
  }

  return { start: startCol, end: endCol + 1 };
}
