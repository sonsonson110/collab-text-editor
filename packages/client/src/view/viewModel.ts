import type { IEditorState } from "@/editor/editorState";
import type { ViewLine } from "./types";
import type { Command } from "@/editor/commands";
import { LINE_HEIGHT } from "@/constants";
import type { RemoteCursorAbsolute, RemoteCursorView } from "@/collaboration/awareness";
import { Position } from "@/core/position/position";

/** Extra horizontal padding (in characters) beyond the longest line when computing scroll width. */
const SCROLL_X_PADDING = 3;

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

  /**
   * Reserves pixel space above line 0 in the scroll area.
   *
   * Setting a positive value shifts all rendered lines down by that many pixels,
   * creating empty space where overlaid chrome (remote-cursor labels, search
   * bars, replace boxes) can be shown without obscuring document content.
   * Does **not** notify subscribers — call before the EditorView first renders.
   */
  setTopPadding(px: number): void;
  /** Returns the current top padding in pixels. */
  getTopPadding(): number;

  // Cursor / selection
  isCursorVisible(): boolean;
  isSelectionCollapsed(): boolean;
  getCursorViewportPosition(): { line: number; column: number };
  getAnchorViewportPosition(): { line: number; column: number };
  getSelectedText(): string;

  // Remote cursors
  setRemoteCursors(cursors: RemoteCursorAbsolute[]): void;
  getRemoteCursorsViewportPositions(): RemoteCursorView[];

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

  /**
   * Extra pixel space reserved above line 0 in the scroll area.
   * Layouts set this to accommodate overlaid chrome (e.g. remote-cursor
   * labels, search bars). Defaults to 0 (no reserved space).
   */
  private topPadding: number = 0;

  /** Cursor positions of all connected remote peers, in absolute document coordinates. */
  private remoteCursors: RemoteCursorAbsolute[] = [];

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
    // Lines start at topPadding in the scroll area, so subtract it before
    // converting the scroll offset to a line index.
    return Math.floor(Math.max(0, this.scrollTop - this.topPadding) / LINE_HEIGHT);
  }

  getViewportEnd(): number {
    // Bottom visible pixel in the scroll area, offset by topPadding.
    return Math.min(
      Math.max(0, Math.ceil((this.scrollTop + this.viewportHeight - this.topPadding) / LINE_HEIGHT)),
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
    // topPadding zone above line 0 + all lines + one LINE_HEIGHT of bottom
    // padding so the horizontal scrollbar never overlaps the last line.
    return this.topPadding + this.editor.getLineCount() * LINE_HEIGHT + LINE_HEIGHT;
  }

  setTopPadding(px: number): void {
    this.topPadding = Math.max(0, px);
  }

  getTopPadding(): number {
    return this.topPadding;
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

  /** Replace the stored set of remote cursors (called from the awareness listener). */
  setRemoteCursors(cursors: RemoteCursorAbsolute[]): void {
    this.remoteCursors = cursors;
  }

  /**
   * Convert stored remote cursors to viewport-relative positions for rendering.
   *
   * Only cursors whose head or selection range overlaps the visible line range
   * are included, so off-screen peers don't produce DOM elements.
   */
  getRemoteCursorsViewportPositions(): RemoteCursorView[] {
    const vpStart = this.getViewportStart();
    const vpEnd = this.getViewportEnd();

    return this.remoteCursors
      .filter(c => {
        const minLine = Math.min(c.anchor.line, c.head.line);
        const maxLine = Math.max(c.anchor.line, c.head.line);
        return maxLine >= vpStart && minLine < vpEnd;
      })
      .map(c => ({
        ...c,
        anchor: new Position(c.anchor.line - vpStart, c.anchor.column),
        head: new Position(c.head.line - vpStart, c.head.column),
      }));
  }

  scrollToCursor(): void {
    const cursorPos = this.editor.getCursor().active;

    // Effective scroll-area pixel positions of the cursor, accounting for
    // topPadding (line 0 starts at this.topPadding in the scroll area).
    const cursorScrollTop = this.topPadding + cursorPos.line * LINE_HEIGHT;
    const cursorScrollBottom = cursorScrollTop + LINE_HEIGHT;

    const cursorPxExtents = cursorPos.column * this.charWidth;

    // Vertical adjust
    if (cursorScrollTop < this.scrollTop) {
      this.scrollTop = cursorScrollTop;
    } else if (cursorScrollBottom > this.scrollTop + this.viewportHeight) {
      this.scrollTop = cursorScrollBottom - this.viewportHeight;
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