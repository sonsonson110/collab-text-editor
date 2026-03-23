import { mapKeyboardEvent } from "@/ui/inputHandler";
import type { IViewModel } from "@/view/viewModel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type MouseEventHandler,
} from "react";
import { Cursor as CursorComponent } from "./Cursor";
import { Line } from "./Line";
import { LINE_HEIGHT } from "@/constants";
import { Position } from "@/core/position/position";

interface Props {
  viewModel: IViewModel;
}

export function EditorView({ viewModel }: Props) {
  const [lines, setLines] = useState(viewModel.getVisibleLines());
  const [cursor, setCursor] = useState(viewModel.getCursorViewportPosition());

  const containerRef = useRef<HTMLDivElement>(null);
  // Calculate char width once and store it, to avoid expensive calculations on every render
  const charWidthRef = useRef<number>(null);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    const command = mapKeyboardEvent(e);
    if (command) {
      viewModel.execute(command);
      e.preventDefault();
    }
  };

  // ---------------------------------------------------------------------------
  // Mouse click → cursor position
  // ---------------------------------------------------------------------------

  const handleClick: MouseEventHandler<HTMLDivElement> = (e) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();

    // Resolve character width once and cache it — monospace means every
    // character has the same width, so one measurement lasts forever.
    if (charWidthRef.current === null) {
      charWidthRef.current = measureCharWidth(container);
    }
    const charWidth = charWidthRef.current;

    // Y → absolute document line
    const relativeY = e.clientY - rect.top;
    const clickedRelativeLine = Math.floor(relativeY / LINE_HEIGHT);
    const viewportStart = viewModel.getViewportStart();
    const absoluteLine = viewportStart + clickedRelativeLine;
    const clampedLine = Math.max(
      0,
      Math.min(absoluteLine, viewModel.getLineCount() - 1),
    );

    // X → column, clamped to the actual line length
    const relativeX = e.clientX - rect.left;
    const clickedColumn = Math.round(relativeX / charWidth);
    const lineLength = viewModel.getLineContent(clampedLine).length;
    const clampedColumn = Math.max(0, Math.min(clickedColumn, lineLength));

    viewModel.execute({
      type: "move_cursor_to",
      position: new Position(clampedLine, clampedColumn),
    });

    container.focus();
  };

  const sync = useCallback(() => {
    viewModel.scrollToCursor();
    setLines(viewModel.getVisibleLines());
    setCursor(viewModel.getCursorViewportPosition());
  }, [viewModel]);

  useEffect(() => {
    sync();
    return viewModel.subscribe(sync);
  }, [viewModel, sync]);

  return (
    <div
      ref={containerRef}
      className="editor border border-white"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >
      {lines.map((line) => (
        <Line key={line.lineNumber} line={line} />
      ))}

      {cursor && <CursorComponent position={cursor} />}
    </div>
  );
}

/**
 * Measures the pixel width of a single character in the editor's monospace
 * font using an offscreen canvas. Called once and cached.
 */
function measureCharWidth(element: HTMLElement): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return 8; // safe fallback
  }

  const style = window.getComputedStyle(element);
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText("M").width;
}
