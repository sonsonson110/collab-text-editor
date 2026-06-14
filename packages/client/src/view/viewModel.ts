import type { IEditorState } from "@/editor/editorState";
import type { ViewLine, TopPaddingReservationKey } from "./types";
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
   * Register or update a named top-padding reservation.
   *
   * Multiple independent features (remote-cursor labels, search bar overlay,
   * etc.) can each claim vertical space above line 0. The effective top
   * padding is the maximum of all active reservations.
   *
   * When the effective padding changes and the user has already scrolled
   * away from the top (`scrollTop > 0`), the scroll offset is adjusted by
   * the delta so the same document lines remain visible — only the
   * scrollbar thumb moves. When `scrollTop === 0`, the viewport shifts
   * naturally so the padding space becomes visible.
   *
   * Pass `px = 0` to release a reservation without removing the key.
   */
  reserveTopPadding(key: TopPaddingReservationKey, px: number): void;
  /** Returns the current effective top padding in pixels (max of all reservations). */
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
   * Named top-padding reservations keyed by feature name.
   * Each entry claims a non-negative pixel height above line 0.
   * The effective top padding is `max(values)` — removing one factor
   * falls back to the next-highest reservation rather than dropping to 0.
   */
  private topPaddingReservations = new Map<TopPaddingReservationKey, number>();

  /** Cursor positions of all connected remote peers, in absolute document coordinates. */
  private remoteCursors: RemoteCursorAbsolute[] = [];

  private listeners = new Set<() => void>();

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
    return Math.floor(Math.max(0, this.scrollTop - this.getTopPadding()) / LINE_HEIGHT);
  }

  getViewportEnd(): number {
    // Bottom visible pixel in the scroll area, offset by topPadding.
    return Math.min(
      Math.max(0, Math.ceil((this.scrollTop + this.viewportHeight - this.getTopPadding()) / LINE_HEIGHT)),
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
    return this.getTopPadding() + this.editor.getLineCount() * LINE_HEIGHT + LINE_HEIGHT;
  }

  reserveTopPadding(key: TopPaddingReservationKey, px: number): void {
    const oldEffective = this.getTopPadding();
    this.topPaddingReservations.set(key, Math.max(0, px));
    const newEffective = this.getTopPadding();
    const delta = newEffective - oldEffective;

    if (delta !== 0 && this.scrollTop > 0) {
      this.scrollTop += delta;
      this.clampScrollPosition();
    }
    
    if (delta !== 0) {
      this.notifyListeners();
    }
  }

  getTopPadding(): number {
    if (this.topPaddingReservations.size === 0) {
      return 0;
    }
    return Math.max(...this.topPaddingReservations.values());
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

  /** 
   * Replace the stored set of remote cursors (called from the awareness listener). 
   * 
   * We explicitly notify listeners here because remote cursor positions are
   * re-resolved asynchronously (e.g. inside `useCollaborativeEditor`'s `ytextObserver`)
   * after a remote text sync update has already triggered a React re-render queue.
   * By notifying the listeners, we ensure `EditorView` pulls the newly resolved
   * remote cursor positions into React state so the UI renders them perfectly flush
   * with the newly inserted keystrokes (instead of visually lagging behind).
   */
  setRemoteCursors(cursors: RemoteCursorAbsolute[]): void {
    this.remoteCursors = cursors;
    this.notifyListeners();
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
    const cursorScrollTop = this.getTopPadding() + cursorPos.line * LINE_HEIGHT;
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

  /**
   * Subscribes to changes in both the underlying EditorState and the ViewModel itself.
   *
   * The ViewModel maintains its own listeners so it can trigger UI re-renders for
   * view-specific state changes (like scroll padding adjustments and remote cursor 
   * resolutions) that the underlying core EditorState has no knowledge of.
   */
  subscribe(callback: () => void): () => void {
    const unsubEditor = this.editor.subscribe(callback);
    this.listeners.add(callback);
    return () => {
      unsubEditor();
      this.listeners.delete(callback);
    };
  }

  /**
   * Notifies `EditorView` (or other subscribers) that view-specific state has changed
   * and requires a re-render to reflect updates (e.g. a remote cursor changing position).
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  execute(command: Command): void {
    this.editor.execute(command);
  }
}