import clsx from "clsx";
import { useCallback, useRef } from "react";

interface Props {
  /** "vertical" | "horizontal" */
  orientation: "vertical" | "horizontal";
  /** Total scrollable size in px (scrollHeight or scrollWidth) */
  scrollSize: number;
  /** Visible viewport size in px (viewportHeight or viewportWidth) */
  viewportSize: number;
  /** Current scroll offset in px */
  scrollOffset: number;
  /** Called when the user drags the thumb to a new offset */
  onScroll: (newOffset: number) => void;
  /** Whether the scrollbar is visible (controlled externally by mouse-in state) */
  visible: boolean;
}

const MIN_THUMB_SIZE = 24; // px — prevents thumb from becoming a tiny dot

export function Scrollbar({
  orientation,
  scrollSize,
  viewportSize,
  scrollOffset,
  onScroll,
  visible,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Store drag start info without triggering re-renders
  const dragRef = useRef<{
    startPointer: number;
    startOffset: number;
  } | null>(null);

  const isVertical = orientation === "vertical";

  // -------------------------------------------------------------------------
  // Compute thumb geometry
  // -------------------------------------------------------------------------
  const scrollable = Math.max(scrollSize - viewportSize, 1);
  const ratio = Math.min(viewportSize / scrollSize, 1); // 0..1
  const trackSize = viewportSize;
  const thumbSize = Math.max(ratio * trackSize, MIN_THUMB_SIZE);
  const thumbTravel = trackSize - thumbSize; // how far the thumb can move
  const thumbOffset = thumbTravel === 0 ? 0 : (scrollOffset / scrollable) * thumbTravel;

  // -------------------------------------------------------------------------
  // Pointer drag on thumb
  // -------------------------------------------------------------------------
  const handleThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      // Capture scroll position at the moment the drag starts and freeze it.
      // scrollOffset is accessed via the ref below so we always read the
      // live value without adding it to deps (which would re-create the
      // handler every render and reset the anchor mid-drag).
      dragRef.current = {
        startPointer: isVertical ? e.clientY : e.clientX,
        startOffset: scrollOffsetRef.current,
      };
    },
    [isVertical],
  );

  const handleThumbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) {
        return;
      }
      const pointerPos = isVertical ? e.clientY : e.clientX;
      const delta = pointerPos - dragRef.current.startPointer;
      const dragRatio = delta / thumbTravel;
      const unclamped = dragRef.current.startOffset + dragRatio * scrollable;
      const newOffset = Math.max(0, Math.min(unclamped, scrollable));
      onScroll(newOffset);
    },
    [isVertical, thumbTravel, scrollable, onScroll],
  );

  const handleThumbPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Click on track (jump to position)
  // -------------------------------------------------------------------------
  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!trackRef.current) {
        return;
      }
      const rect = trackRef.current.getBoundingClientRect();
      const rawPos = isVertical ? e.clientY - rect.top : e.clientX - rect.left;
      // Jump so that thumb centre aligns to click point
      const centred = Math.max(0, Math.min(rawPos - thumbSize / 2, thumbTravel));
      const newOffset = thumbTravel === 0 ? 0 : (centred / thumbTravel) * scrollable;
      onScroll(newOffset);
    },
    [isVertical, thumbSize, thumbTravel, scrollable, onScroll],
  );

  // Keep a ref to the latest scrollOffset so handleThumbPointerDown can
  // read the live value without it being a closure dependency.
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;

  // Don't render when content fits entirely in viewport (no need to scroll)
  if (ratio >= 1) {
    return null;
  }

  // Only truly dynamic pixel values stay inline; axis-dependent static sides
  // are expressed as Tailwind utilities via clsx.
  const trackStyle: React.CSSProperties = isVertical
    ? { height: "100%" }
    : { width: "100%" };

  const thumbStyle: React.CSSProperties = isVertical
    ? { top: thumbOffset, height: thumbSize }
    : { left: thumbOffset, width: thumbSize };

  return (
    <div
      ref={trackRef}
      className={clsx(
        "scrollbar-track",
        isVertical ? "scrollbar-track--vertical" : "scrollbar-track--horizontal",
        visible && "scrollbar-track--visible",
      )}
      style={trackStyle}
      onPointerDown={handleTrackPointerDown}
    >
      <div
        className={clsx(
          "scrollbar-thumb",
          isVertical ? "inset-x-0" : "inset-y-0",
          "absolute",
        )}
        style={thumbStyle}
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={handleThumbPointerUp}
      />
    </div>
  );
}
