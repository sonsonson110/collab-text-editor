import { LINE_HEIGHT } from "@/constants";
import type { SelectionRect } from "../utils";

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
              backgroundColor: "var(--selection-color)",
            }}
          />
        );
      })}
    </>
  );
}

