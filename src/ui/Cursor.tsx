const LINE_HEIGHT = 20;

export function Cursor({
  position,
}: {
  position: { line: number; column: number };
}) {
  return (
    <div
      className="cursor w-0.5 h-5 bg-black absolute"
      style={{
        top: position.line * LINE_HEIGHT,
        left: `calc(${position.column} * 1ch)`,
      }}
    />
  );
}
