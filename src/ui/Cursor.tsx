import { LINE_HEIGHT } from "@/constants";

export function Cursor({
  position,
}: {
  position: { line: number; column: number };
}) {
  return (
    <div
      className="cursor absolute"
      style={{
        top: position.line * LINE_HEIGHT,
        left: `calc(${position.column} * 1ch)`,
        width: `calc(0.1 * 1ch)`,
        height: LINE_HEIGHT,
      }}
    />
  );
}
