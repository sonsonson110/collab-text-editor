const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8;

export function Cursor({
  position,
}: {
  position: { line: number; column: number };
}) {
  return (
    <div
      className="cursor w-px h-5 bg-black absolute"
      style={{
        top: position.line * LINE_HEIGHT,
        left: position.column * CHAR_WIDTH,
      }}
    />
  );
}
