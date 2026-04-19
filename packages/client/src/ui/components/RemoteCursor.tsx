import { LINE_HEIGHT } from "@/constants";
import { useEditorConfig } from "../EditorConfigContext";
import type { RemoteCursorView } from "@/collaboration/awareness";
import clsx from "clsx";
import { useEffect, useState } from "react";

/** Milliseconds of inactivity before the name label fades out. */
const LABEL_FADE_DELAY_MS = 3000;

interface Props {
  remoteCursor: RemoteCursorView;
}

/**
 * Renders another user's cursor position and name label inside the editor viewport.
 *
 * The cursor bar and label background colour are set dynamically via inline
 * `style` (they depend on the remote user's assigned colour). All other
 * static layout/typography is expressed with Tailwind utility classes.
 *
 * The name label appears whenever the remote cursor moves, then fades out
 * after {@link LABEL_FADE_DELAY_MS} of inactivity. Hovering the cursor bar
 * forces the label visible regardless of the timer.
 */
export function RemoteCursor({ remoteCursor }: Props) {
  const { charWidth } = useEditorConfig();
  const { head, user } = remoteCursor;

  const [labelVisible, setLabelVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  // Reset visibility whenever the cursor position changes, then start
  // the fade-out timer.
  useEffect(() => {
    setLabelVisible(true);
    const timer = setTimeout(() => setLabelVisible(false), LABEL_FADE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [head.line, head.column]);

  return (
    <div
      className={clsx(
        "remote-cursor",
        "absolute w-0.5 z-10 transition-[top,left] duration-100",
      )}
      style={{
        top: head.line * LINE_HEIGHT,
        left: head.column * charWidth,
        height: LINE_HEIGHT,
        backgroundColor: user.color,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={clsx(
          "remote-cursor-label",
          "absolute left-0 text-white text-[10px] px-1 py-0.5 rounded-sm whitespace-nowrap select-none pointer-events-none",
        )}
        style={{
          top: -LINE_HEIGHT,
          backgroundColor: user.color,
          opacity: labelVisible || hovered ? 1 : 0,
        }}
      >
        {user.name}
      </div>
    </div>
  );
}
