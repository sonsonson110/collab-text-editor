import type { IEditorState } from "@/editor/editorState";
import type { ViewLine } from "./types";
import type { Command } from "@/editor/commands";
import { LINE_HEIGHT } from "@/constants";

const SCROLL_X_PADDING = 3; // in characters

export interface IViewModel {
  // Viewport queries
  getViewportStart(): number;
  getLineCount(): number;
  getLineContent(line: number): string;

  // Visible content
  getVisibleLines(): ViewLine[];
  setViewport(width: number, height: number, charWidth: number): void;

  // Viewport sizes and positions (in pixels)
  getScrollTop(): number;
  getScrollLeft(): number;
  getScrollHeight(): number;
  getScrollWidth(): number;
  getViewportWidth(): number;
  getViewportHeight(): number;
  scrollBy(deltaX: number, deltaY: number): void;
  setScrollPosition(left: number, top: number): void;

  // Cursor / selection
  isCursorVisible(): boolean;
  isSelectionCollapsed(): boolean;
  getCursorViewportPosition(): { line: number; column: number };
  getAnchorViewportPosition(): { line: number; column: number };
  getSelectedText(): string;

  // Adjust scroll position
  scrollToCursor(): void;

  // Reactive bridge
  subscribe(callback: () => void): () => void;
  execute(command: Command): void;
}

export class ViewModel implements IViewModel {
  private editor: IEditorState;
  
  // Pixel coordinates
  private scrollTop: number;
  private scrollLeft: number;
  
  private viewportWidth: number;
  private viewportHeight: number;
  private charWidth: number;

  constructor(
    editor: IEditorState,
  ) {
    this.editor = editor;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.viewportWidth = 800; // sensible defaults
    this.viewportHeight = 600;
    this.charWidth = 8;
  }

  getLineCount(): number {
    return this.editor.getLineCount();
  }

  getLineContent(line: number): string {
    return this.editor.getLineContent(line);
  }

  getViewportStart(): number {
    return Math.floor(this.scrollTop / LINE_HEIGHT);
  }

  getViewportEnd(): number {
    // Top pixel of the line relative to viewtop:
    // If scrollTop is 10, line 0 is -10 to 10
    // We render lines up to the one overlapping the bottom edge.
    return Math.min(
      Math.ceil((this.scrollTop + this.viewportHeight) / LINE_HEIGHT),
      this.editor.getLineCount(),
    );
  }

  setViewport(width: number, height: number, charWidth: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.charWidth = Math.max(1, charWidth);
    this.clampScrollPosition();
  }

  // ---------------------------------------------------------------------------
  // Viewport sizes and positions
  // ---------------------------------------------------------------------------

  getScrollTop(): number {
    return this.scrollTop;
  }

  getScrollLeft(): number {
    return this.scrollLeft;
  }

  getViewportWidth(): number {
    return this.viewportWidth;
  }

  getViewportHeight(): number {
    return this.viewportHeight;
  }

  getScrollHeight(): number {
    return this.editor.getLineCount() * LINE_HEIGHT;
  }

  getScrollWidth(): number {
    return (this.editor.getMaxLineLength() + SCROLL_X_PADDING) * this.charWidth;
  }

  scrollBy(deltaX: number, deltaY: number): void {
    this.scrollLeft += deltaX;
    this.scrollTop += deltaY;
    this.clampScrollPosition();
  }

  setScrollPosition(left: number, top: number): void {
    this.scrollLeft = left;
    this.scrollTop = top;
    this.clampScrollPosition();
  }

  private clampScrollPosition(): void {
    const maxScrollTop = Math.max(this.getScrollHeight() - this.viewportHeight, 0);
    this.scrollTop = Math.min(Math.max(this.scrollTop, 0), maxScrollTop);

    const maxScrollLeft = Math.max(this.getScrollWidth() - this.viewportWidth, 0);
    this.scrollLeft = Math.min(Math.max(this.scrollLeft, 0), maxScrollLeft);
  }

  // ---------------------------------------------------------------------------

  getVisibleLines(): ViewLine[] {
    this.clampScrollPosition();

    const lines: ViewLine[] = [];
    const start = this.getViewportStart();
    const end = this.getViewportEnd();

    for (let i = start; i < end; i++) {
      lines.push({
        lineNumber: i,
        content: this.editor.getLineContent(i),
      });
    }
    return lines;
  }

  isCursorVisible(): boolean {
    const cursorPos = this.editor.getCursor().active;
    
    // Convert to pixel rectangles
    const cursorTop = cursorPos.line * LINE_HEIGHT;
    const cursorBottom = cursorTop + LINE_HEIGHT;
    const cursorLeft = cursorPos.column * this.charWidth;
    
    const isVisibleVertically =
      cursorBottom > this.scrollTop && cursorTop < this.scrollTop + this.viewportHeight;
    const isVisibleHorizontally =
      cursorLeft >= this.scrollLeft && cursorLeft <= this.scrollLeft + this.viewportWidth;

    return isVisibleVertically && isVisibleHorizontally;
  }

  isSelectionCollapsed(): boolean {
    return this.editor.getCursor().isCollapsed();
  }

  getSelectedText(): string {
    return this.editor.getSelectedText();
  }

  // Returns logical coordinate bounds relative to visible start line
  getCursorViewportPosition(): { line: number; column: number } {
    const cursorPos = this.editor.getCursor().active;
    return {
      line: cursorPos.line - this.getViewportStart(),
      column: cursorPos.column,
    };
  }

  getAnchorViewportPosition(): { line: number; column: number } {
    const anchor = this.editor.getCursor().anchor;
    const vpStart = this.getViewportStart();

    return {
      line: anchor.line - vpStart,
      column: anchor.column,
    };
  }

  scrollToCursor(): void {
    const cursorPos = this.editor.getCursor().active;
    
    // Cursor pixel rect bounds
    const cursorTop = cursorPos.line * LINE_HEIGHT;
    const cursorBottom = cursorTop + LINE_HEIGHT;
    
    const cursorPxExtents = cursorPos.column * this.charWidth;
    
    // Vertical adjust
    if (cursorTop < this.scrollTop) {
      this.scrollTop = cursorTop;
    } else if (cursorBottom > this.scrollTop + this.viewportHeight) {
      this.scrollTop = cursorBottom - this.viewportHeight;
    }

    // Horizontal adjust
    // Add visual padding for cursor to ensure we see slightly past it
    const PADDING_PX = 4 * this.charWidth; 
    if (cursorPxExtents < this.scrollLeft) {
      this.scrollLeft = Math.max(0, cursorPxExtents - PADDING_PX);
    } else if (cursorPxExtents > this.scrollLeft + this.viewportWidth - PADDING_PX) {
      this.scrollLeft = cursorPxExtents - this.viewportWidth + PADDING_PX;
    }

    this.clampScrollPosition();
  }

  subscribe(callback: () => void): () => void {
    return this.editor.subscribe(callback);
  }

  execute(command: Command): void {
    this.editor.execute(command);
  }
}