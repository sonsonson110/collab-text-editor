import type { ViewLine } from "@/view/types";

interface Props {
  lines: ViewLine[];
  /** Vertical translation offset in pixels. */
  offsetY: number;
  width: number | string;
  onLineNumberMouseDown: (e: React.MouseEvent, line: number) => void;
}

export function Gutter({
  lines,
  offsetY,
  width,
  onLineNumberMouseDown,
}: Props) {
  return (
    <div className="gutter" style={{ width }}>
      <div style={{ transform: `translateY(${offsetY}px)` }}>
        {lines.map((line) => (
          <div
            key={line.lineNumber}
            className="gutter-line"
            onMouseDown={(e) => onLineNumberMouseDown(e, line.lineNumber)}
          >
            {line.lineNumber + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
