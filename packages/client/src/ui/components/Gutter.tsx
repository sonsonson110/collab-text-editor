import { cn } from "@/lib/utils";
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
    <div
      className={cn(
        "gutter",
        "shrink-0 flex flex-col bg-(--background-color) text-muted-foreground",
        "text-right pr-[1ch] select-none border-r border-border z-2",
      )}
      style={{ width }}
    >
      <div style={{ transform: `translateY(${offsetY}px)` }}>
        {lines.map((line) => (
          <div
            key={line.lineNumber}
            className="leading-(--line-height) whitespace-pre cursor-pointer hover:text-foreground transition-colors duration-150"
            onMouseDown={(e) => onLineNumberMouseDown(e, line.lineNumber)}
          >
            {line.lineNumber + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
