import { LINE_HEIGHT } from "@/constants";

interface SelectionRect {
  /** Viewport-relative line index */
  line: number;
  /** Start column (inclusive) */
  startCol: number;
  /** End column (exclusive). null means "extend to end of line + 1ch" */
  endCol: number | null;
}

interface Props {
  rects: SelectionRect[];
}

/**
 * Renders a semi-transparent highlight layer for the active text selection.
 * Each rect covers one line (or a portion of it). Rects are absolute-positioned
 * inside the `.editor` container, sitting behind the text via pointer-events:none.
 */
export function Selection({ rects }: Props) {
  if (rects.length === 0) {
    return null;
  }

  return (
    <>
      {rects.map((rect, i) => {
        const top = rect.line * LINE_HEIGHT;
        const left = `calc(${rect.startCol} * 1ch)`;
        const width =
          rect.endCol === null
            ? `calc(100% - ${rect.startCol}ch} + 1ch)`
            : `calc((${rect.endCol - rect.startCol}) * 1ch)`;

        return (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              top,
              left,
              width,
              height: LINE_HEIGHT,
              backgroundColor: "rgba(255,255,255,0.25)",
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Computes the list of per-line SelectionRects from the cursor's anchor/active
 * positions (already in viewport-relative coordinates).
 *
 * @param anchor  Viewport-relative {line, column} of the selection anchor
 * @param active  Viewport-relative {line, column} of the selection active end
 * @param getLineLength  Returns the character length of a given viewport-relative line
 */
// eslint-disable-next-line react-refresh/only-export-components
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
