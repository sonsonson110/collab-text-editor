import { LINE_HEIGHT } from "@/constants";
import type { SelectionRect } from "../utils";
import { useEditorConfig } from "../EditorConfigContext";
import { cn } from "@/lib/utils";

interface Props {
  rects: SelectionRect[];
  /** The remote user's assigned colour, rendered at low opacity. */
  color: string;
}

/**
 * Renders a semi-transparent tinted highlight layer for a remote user's
 * text selection. Each rect covers one line (or a portion of it).
 *
 * Layout mirrors the local {@link Selection} component but uses the
 * remote user's colour at 20 % opacity so it is visually distinct.
 */
export function RemoteSelection({ rects, color }: Props) {
  const { charWidth } = useEditorConfig();

  if (rects.length === 0) {
    return null;
  }

  return (
    <>
      {rects.map((rect, i) => {
        const top = rect.line * LINE_HEIGHT;
        const left = rect.startCol * charWidth;
        const width =
          rect.endCol === null
            ? `calc(100% - ${left}px + ${charWidth}px)`
            : (rect.endCol - rect.startCol) * charWidth;

        return (
          <div
            key={i}
            className={cn(
              "remote-selection",
              "absolute pointer-events-none transition-[left,top,width] duration-100 ease-out",
            )}
            style={{
              top,
              left,
              width,
              height: LINE_HEIGHT,
              backgroundColor: color,
              opacity: 0.2,
            }}
          />
        );
      })}
    </>
  );
}
