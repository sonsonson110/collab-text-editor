export const LINE_HEIGHT = 20;

export const INITIAL_TEXT = `import { mapKeyboardEvent } from "@/ui/inputHandler";
import type { IViewModel } from "@/view/viewModel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type WheelEventHandler,
} from "react";
import { Cursor as CursorComponent } from "./components/Cursor";
import { Line } from "./components/Line";
import { Selection } from "./components/Selection";
import { LINE_HEIGHT } from "@/constants";
import { Position } from "@/core/position/position";
import { buildSelectionRects } from "@/ui/components/Selection";
import { useEditorConfig } from "./EditorConfigContext";

interface Props {
  viewModel: IViewModel;
}

export function EditorView({ viewModel }: Props) {
  const { charWidth } = useEditorConfig();
  const [lines, setLines] = useState(viewModel.getVisibleLines());
  const [cursor, setCursor] = useState(viewModel.getCursorViewportPosition());
  const [scrollX, setScrollX] = useState(viewModel.getScrollX());
  const [selectionRects, setSelectionRects] = useState(
    buildSelectionRects(
      viewModel.getAnchorViewportPosition() ?? { line: 0, column: 0 },
      viewModel.getCursorViewportPosition() ?? { line: 0, column: 0 },
      (vpLine) =>
        viewModel.getLineContent(viewModel.getViewportStart() + vpLine).length,
      viewModel.getVisibleLines().length,
    ),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(false);
  const didMoveRef = useRef(false);
  const vScrollAccumulatorRef = useRef(0);
  const hScrollAccumulatorRef = useRef(0);

  const lastMousePosRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const scrollRafRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);

  const lineCount = viewModel.getLineCount();
  const gutterDigits = Math.max(1, Math.floor(Math.log10(lineCount)) + 1);
  const gutterWidthCh = gutterDigits + 2;

  // ---------------------------------------------------------------------------
  // Coordinate helper
  // Converts a MouseEvent into a clamped document Position.
  // ---------------------------------------------------------------------------

  const resolvePosition = useCallback(
    (clientX: number, clientY: number): Position | null => {
      const container = contentRef.current;
      if (!container) {
        return null;
      }

      const rect = container.getBoundingClientRect();

      const relativeY = clientY - rect.top;
      const clickedRelativeLine = Math.floor(relativeY / LINE_HEIGHT);
      const absoluteLine = viewModel.getViewportStart() + clickedRelativeLine;
      const clampedLine = Math.max(
        0,
        Math.min(absoluteLine, viewModel.getLineCount() - 1),
      );

      const relativeX = clientX - rect.left;
      const clickedColumn =
        Math.round(relativeX / charWidth) + viewModel.getScrollX();
      const lineLength = viewModel.getLineContent(clampedLine).length;
      const clampedColumn = Math.max(0, Math.min(clickedColumn, lineLength));

      return new Position(clampedLine, clampedColumn);
    },
    [viewModel, charWidth],
  );

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    const command = mapKeyboardEvent(e);
    if (command) {
      viewModel.execute(command);
      e.preventDefault();
    }
  };

  const autoScroll = useCallback(
    (time: number) => {
      if (!isDraggingRef.current || !lastMousePosRef.current) {
        return;
      }
      scrollRafRef.current = requestAnimationFrame(autoScroll);

      // Throttle to approx 20fps for smooth predictable drag-scrolling
      if (time - lastScrollTimeRef.current < 50) {
        return;
      }

      const { clientX, clientY } = lastMousePosRef.current;
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const relativeX = clientX - rect.left;

      const MARGIN = 5; // px
      let explicitScroll = false;

      // Vertical auto-scroll near top/bottom edges
      if (relativeY >= 0 && relativeY < MARGIN) {
        viewModel.scrollUp(1);
        explicitScroll = true;
      } else if (relativeY <= rect.height && relativeY > rect.height - MARGIN) {
        viewModel.scrollDown(1);
        explicitScroll = true;
      }

      // Horizontal auto-scroll near left/right edges
      if (relativeX >= 0 && relativeX < MARGIN) {
        viewModel.scrollLeft(1);
        explicitScroll = true;
      } else if (relativeX <= rect.width && relativeX > rect.width - MARGIN) {
        viewModel.scrollRight(1);
        explicitScroll = true;
      }

      // Trigger select_to if we explicitly scrolled OR if we are outside the container
      if (
        explicitScroll ||
        relativeY < 0 ||
        relativeY > rect.height ||
        relativeX < 0 ||
        relativeX > rect.width
      ) {
        lastScrollTimeRef.current = time;
        const movePosition = resolvePosition(clientX, clientY);
        if (movePosition) {
          viewModel.execute({ type: "select_to", position: movePosition });
        }
      }
    },
    [resolvePosition, viewModel],
  );

  // ---------------------------------------------------------------------------
  // Mouse drag → text selection
  //
  // Flow:
  //   mousedown  — place cursor at click position (collapsed), mark drag start
  //   mousemove  — if dragging, fire select_to so the selection extends live
  //   mouseup    — end drag, clean up window listeners
  //
  // mousemove and mouseup are attached to window so the drag keeps working
  // even when the pointer leaves the editor div.
  // ---------------------------------------------------------------------------
  const handleMouseDown: MouseEventHandler<HTMLDivElement> = (e) => {
    // Only handle primary button (left click)
    if (e.button !== 0) {
      return;
    }

    const position = resolvePosition(e.clientX, e.clientY);
    if (!position) {
      return;
    }

    // Place a collapsed cursor at the click position — this becomes the anchor
    viewModel.execute({ type: "move_cursor_to", position });

    isDraggingRef.current = true;
    didMoveRef.current = false;
    lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
    lastScrollTimeRef.current = performance.now();
    scrollRafRef.current = requestAnimationFrame(autoScroll);

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) {
        return;
      }

      lastMousePosRef.current = {
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      };

      const movePosition = resolvePosition(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      if (!movePosition) {
        return;
      }

      didMoveRef.current = true;
      viewModel.execute({ type: "select_to", position: movePosition });
    };

    const handleWindowMouseUp = () => {
      isDraggingRef.current = false;
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    containerRef.current?.focus();
    // Prevent the browser from triggering its own text selection UI
    e.preventDefault();
  };

  const handleLineNumberMouseDown = useCallback(
    (e: React.MouseEvent, line: number) => {
      e.preventDefault(); // Prevent text selection
      const lineLength = viewModel.getLineContent(line).length;

      // Move anchor to start of line
      viewModel.execute({
        type: "move_cursor_to",
        position: new Position(line, 0),
      });

      // Move active Selection to end of line
      viewModel.execute({
        type: "select_to",
        position: new Position(line, lineLength),
      });

      containerRef.current?.focus();
    },
    [viewModel],
  );

  const updateView = useCallback(() => {
    const nextLines = viewModel.getVisibleLines();
    const nextCursor = viewModel.getCursorViewportPosition();

    // Build selection rects in viewport-relative coordinates
    const anchorVp = viewModel.getAnchorViewportPosition();
    const activeVp = nextCursor;
    const vpStart = viewModel.getViewportStart();

    const nextRects =
      anchorVp && activeVp && !viewModel.isSelectionCollapsed()
        ? buildSelectionRects(
            anchorVp,
            activeVp,
            (vpLine) => viewModel.getLineContent(vpStart + vpLine).length,
            nextLines.length,
          )
        : [];
    setLines(nextLines);
    setCursor(nextCursor);
    setSelectionRects(nextRects);
    setScrollX(viewModel.getScrollX());
  }, [viewModel]);

  const handleWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      const PIXELS_PER_UNIT = 50;

      // --- Vertical scrolling ---
      // Shift+wheel redirects vertical delta to horizontal; skip vertical in that case
      if (!e.shiftKey && e.deltaY !== 0) {
        const deltaY = Math.abs(e.deltaY);
        const scrollDirection = e.deltaY > 0 ? "down" : "up";
        vScrollAccumulatorRef.current +=
          e.deltaMode === 1 ? deltaY * PIXELS_PER_UNIT : deltaY;

        const lines = Math.trunc(
          vScrollAccumulatorRef.current / PIXELS_PER_UNIT,
        );
        if (lines !== 0) {
          if (scrollDirection === "down") {
            viewModel.scrollDown(lines);
          } else {
            viewModel.scrollUp(lines);
          }
          vScrollAccumulatorRef.current -= lines * PIXELS_PER_UNIT;
        }
      }

      // --- Horizontal scrolling ---
      // Native deltaX (trackpad) or Shift+deltaY (mouse wheel)
      const rawDeltaX = e.shiftKey ? e.deltaY : e.deltaX;
      if (rawDeltaX !== 0) {
        const absDeltaX = Math.abs(rawDeltaX);
        const hDirection = rawDeltaX > 0 ? "right" : "left";
        hScrollAccumulatorRef.current +=
          e.deltaMode === 1 ? absDeltaX * PIXELS_PER_UNIT : absDeltaX;

        const cols = Math.trunc(
          hScrollAccumulatorRef.current / PIXELS_PER_UNIT,
        );
        if (cols !== 0) {
          if (hDirection === "right") {
            viewModel.scrollRight(cols);
          } else {
            viewModel.scrollLeft(cols);
          }
          hScrollAccumulatorRef.current -= cols * PIXELS_PER_UNIT;
        }
      }

      updateView();
    },
    [viewModel, updateView],
  );

  const sync = useCallback(() => {
    viewModel.scrollToCursor();
    updateView();
  }, [viewModel, updateView]);

  // -------------------------------------------------------------------------
  // ResizeObserver — derive visible line count and visible column count from
  // actual container size
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect;

        // Update vertical visible line count
        const newLineCount = Math.floor(height / LINE_HEIGHT);
        if (
          newLineCount > 0 &&
          newLineCount !== viewModel.getVisibleLineCount()
        ) {
          viewModel.setVisibleLineCount(newLineCount);
        }

        // Update horizontal visible column count from the content area
        const contentEl = contentRef.current;
        if (contentEl) {
          const contentWidth = contentEl.getBoundingClientRect().width;
          const newColCount = Math.floor(contentWidth / charWidth);
          if (
            newColCount > 0 &&
            newColCount !== viewModel.getVisibleColumnCount()
          ) {
            viewModel.setVisibleColumnCount(newColCount);
          }
        }

        updateView();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [viewModel, updateView, charWidth]);

  useEffect(() => {
    sync();
    return viewModel.subscribe(sync);
  }, [viewModel, sync]);

  return (
    <div
      ref={containerRef}
      className="editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    >
      <div className="gutter" style={{ width: 1ch }}>
        {lines.map((line) => (
          <div
            key={line.lineNumber}
            className="gutter-line"
            onMouseDown={(e) => handleLineNumberMouseDown(e, line.lineNumber)}
          >
            {line.lineNumber + 1}
          </div>
        ))}
      </div>

      <div
        className="editor-content"
        ref={contentRef}
        onMouseDown={handleMouseDown}
        <div
          style={{
            transform: 'translateX(calc(-SCROLL_X * 1ch))',
          }}
        >
          <Selection rects={selectionRects} />

          {lines.map((line) => (
            <Line key={line.lineNumber} line={line} />
          ))}

          {cursor && viewModel.isCursorVisible() && (
            <CursorComponent position={cursor} />
          )}
        </div>
      </div>
    </div>
  );
}
`;
