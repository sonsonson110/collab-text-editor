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
import {
  Cursor as CursorComponent,
  Line,
  Selection,
  Scrollbar,
  SCROLLBAR_SIZE,
  Gutter,
} from "./components";
import { getWordSelection, mapKeyboardEvent, buildSelectionRects } from "./utils";
import { LINE_HEIGHT } from "@/constants";
import { Position } from "@/core/position/position";
import { useEditorConfig } from "./EditorConfigContext";

interface Props {
  viewModel: IViewModel;
}

export function EditorView({ viewModel }: Props) {
  const { charWidth } = useEditorConfig();
  const [lines, setLines] = useState(viewModel.getVisibleLines());
  const [cursor, setCursor] = useState(viewModel.getCursorViewportPosition());
  const [scrollTop, setScrollTop] = useState(viewModel.getScrollTop());
  const [scrollLeft, setScrollLeft] = useState(viewModel.getScrollLeft());
  const [scrollHeight, setScrollHeight] = useState(viewModel.getScrollHeight());
  const [scrollWidth, setScrollWidth] = useState(viewModel.getScrollWidth());
  const [viewportHeight, setViewportHeight] = useState(
    viewModel.getViewportHeight(),
  );
  const [viewportWidth, setViewportWidth] = useState(
    viewModel.getViewportWidth(),
  );
  const [isMouseInEditor, setIsMouseInEditor] = useState(false);
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
      const absoluteY = viewModel.getScrollTop() + relativeY;
      const clickedAbsoluteLine = Math.floor(absoluteY / LINE_HEIGHT);
      const clampedLine = Math.max(
        0,
        Math.min(clickedAbsoluteLine, viewModel.getLineCount() - 1),
      );

      const relativeX = clientX - rect.left;
      const absoluteX = viewModel.getScrollLeft() + relativeX;
      const clickedColumn = Math.round(absoluteX / charWidth);
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
        viewModel.scrollBy(0, -10);
        explicitScroll = true;
      } else if (relativeY <= rect.height && relativeY > rect.height - MARGIN) {
        viewModel.scrollBy(0, 10);
        explicitScroll = true;
      }

      // Horizontal auto-scroll near left/right edges
      if (relativeX >= 0 && relativeX < MARGIN) {
        viewModel.scrollBy(-10, 0);
        explicitScroll = true;
      } else if (relativeX <= rect.width && relativeX > rect.width - MARGIN) {
        viewModel.scrollBy(10, 0);
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

    if (e.detail === 3) {
      const lineLength = viewModel.getLineContent(position.line).length;
      viewModel.execute({
        type: "move_cursor_to",
        position: new Position(position.line, 0),
      });
      viewModel.execute({
        type: "select_to",
        position: new Position(position.line, lineLength),
      });
      e.preventDefault();
      return;
    }

    if (e.detail === 2) {
      const lineContent = viewModel.getLineContent(position.line);
      const { start, end } = getWordSelection(lineContent, position.column);
      viewModel.execute({
        type: "move_cursor_to",
        position: new Position(position.line, start),
      });
      viewModel.execute({
        type: "select_to",
        position: new Position(position.line, end),
      });
      e.preventDefault();
      return;
    }

    // Place a collapsed cursor at the click position — this becomes the anchor
    if (e.shiftKey) {
      viewModel.execute({ type: "select_to", position });
    } else {
      viewModel.execute({ type: "move_cursor_to", position });
    }

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
    setScrollTop(viewModel.getScrollTop());
    setScrollLeft(viewModel.getScrollLeft());
    setScrollHeight(viewModel.getScrollHeight());
    setScrollWidth(viewModel.getScrollWidth());
    setViewportHeight(viewModel.getViewportHeight());
    setViewportWidth(viewModel.getViewportWidth());
  }, [viewModel]);

  const handleWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      const PIXELS_PER_UNIT = LINE_HEIGHT / 2;

      // Handle shift+wheel for horizontal scroll
      const rawDeltaY = e.shiftKey ? 0 : e.deltaY;
      const rawDeltaX = e.shiftKey ? e.deltaY : e.deltaX;

      const mult = e.deltaMode === 1 ? PIXELS_PER_UNIT : 1;

      if (rawDeltaX !== 0 || rawDeltaY !== 0) {
        viewModel.scrollBy(rawDeltaX * mult, rawDeltaY * mult);
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
  // ResizeObserver - update viewport size when container size changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect;

        const contentEl = contentRef.current;
        if (contentEl) {
          const contentRect = contentEl.getBoundingClientRect();
          viewModel.setViewport(contentRect.width, height, charWidth);
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
      onMouseEnter={() => setIsMouseInEditor(true)}
      onMouseLeave={() => setIsMouseInEditor(false)}
    >
      <Gutter
        lines={lines}
        scrollTop={scrollTop}
        width={`${gutterWidthCh}ch`}
        onLineNumberMouseDown={handleLineNumberMouseDown}
      />

      <div
        className="editor-content"
        ref={contentRef}
        onMouseDown={handleMouseDown}
      >
        <div
          style={{
            position: "relative",
            transform: `translate3d(-${scrollLeft}px, -${scrollTop % LINE_HEIGHT}px, 0)`,
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

        <Scrollbar
          orientation="vertical"
          scrollSize={scrollHeight}
          viewportSize={viewportHeight}
          scrollOffset={scrollTop}
          onScroll={(newOffset) => {
            viewModel.setScrollPosition(viewModel.getScrollLeft(), newOffset);
            updateView();
          }}
          visible={isMouseInEditor}
        />

        <Scrollbar
          orientation="horizontal"
          scrollSize={scrollWidth}
          viewportSize={viewportWidth}
          trackSize={viewportWidth - SCROLLBAR_SIZE}
          scrollOffset={scrollLeft}
          onScroll={(newOffset) => {
            viewModel.setScrollPosition(newOffset, viewModel.getScrollTop());
            updateView();
          }}
          visible={isMouseInEditor}
        />
      </div>
    </div>
  );
}

