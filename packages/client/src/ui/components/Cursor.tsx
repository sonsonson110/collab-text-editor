import { cn } from "@/lib/utils";
import { LINE_HEIGHT } from "@/constants";

export function Cursor({
  position,
}: {
  position: { line: number; column: number };
}) {
  return (
    <div
      className={cn(
        "cursor",
        "absolute pointer-events-none bg-(--text-color) animate-[blink_1s_step-end_infinite]"
      )}
      style={{
        top: position.line * LINE_HEIGHT,
        left: `calc(${position.column} * 1ch)`,
        width: `calc(0.1 * 1ch)`,
        height: LINE_HEIGHT,
      }}
    />
  );
}
