import { describe, it, expect, vi } from "vitest";
import { ViewModel } from "./viewModel";
import type { IEditorState } from "@/editor/editorState";
import { Cursor } from "@/editor/cursor/cursor";
import { Position } from "@/core/position/position";
import { LINE_HEIGHT } from "@/constants";

const p = (line: number, col: number) => new Position(line, col);

// ---------------------------------------------------------------------------
// Stub factory
// ---------------------------------------------------------------------------

interface StubOptions {
  lineCount: number;
  cursorLine?: number;
  cursorCol?: number;
  maxLineLength?: number;
  overrides?: Partial<IEditorState>;
}

function makeStub({
  lineCount,
  cursorLine = 0,
  cursorCol = 0,
  maxLineLength = 80,
  overrides = {},
}: StubOptions): IEditorState {
  return {
    getCursor: () => new Cursor(p(cursorLine, cursorCol)),
    getLineCount: () => lineCount,
    getLineContent: (line: number) => `line${line}`,
    getMaxLineLength: () => maxLineLength,
    getSelectedText: () => "",
    execute: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    ...overrides,
  };
}

const CHAR_WIDTH = 8;

function makeVM(
  stub: IEditorState,
  startLine = 0,
  visibleLines = 5,
  visibleCols = 80
): ViewModel {
  const vm = new ViewModel(stub);
  vm.setViewport(visibleCols * CHAR_WIDTH, visibleLines * LINE_HEIGHT, CHAR_WIDTH);
  vm.setScrollPosition(0, startLine * LINE_HEIGHT);
  return vm;
}

describe("ViewModel", () => {
  // -------------------------------------------------------------------------
  // Viewport Line Calculations
  // -------------------------------------------------------------------------
  describe("getViewportStart", () => {
    it("returns correct start line based on scrollTop", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 20);
      expect(vm.getViewportStart()).toBe(10);
    });

    it("clamps to max possible start line", () => {
      // 30 lines total, viewport shows 15 lines.
      // scrollHeight = 0 + 30*LINE_HEIGHT + LINE_HEIGHT = 31*LINE_HEIGHT
      // maxScrollTop = 31*LINE_HEIGHT - 15*LINE_HEIGHT = 16*LINE_HEIGHT
      const vm = makeVM(makeStub({ lineCount: 30 }));
      vm.setViewport(800, 15 * LINE_HEIGHT, CHAR_WIDTH);
      vm.setScrollPosition(0, 20 * LINE_HEIGHT);
      expect(vm.getViewportStart()).toBe(16);
      expect(vm.getScrollTop()).toBe(16 * LINE_HEIGHT);
    });
  });

  describe("getViewportEnd", () => {
    it("returns start line + visible lines", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 20);
      expect(vm.getViewportEnd()).toBe(30);
    });

    it("clamps to lineCount", () => {
      const vm = makeVM(makeStub({ lineCount: 25 }), 20, 10);
      expect(vm.getViewportEnd()).toBe(25);
    });
  });

  describe("getVisibleLines", () => {
    it("returns visible lines from the dataset", () => {
      const vm = makeVM(makeStub({ lineCount: 10 }), 0, 5);
      const lines = vm.getVisibleLines();
      expect(lines).toHaveLength(5);
      expect(lines[0].lineNumber).toBe(0);
      expect(lines[4].lineNumber).toBe(4);
    });

    it("returns fewer lines when near the end of document", () => {
      const vm = makeVM(makeStub({ lineCount: 3 }), 0, 5);
      expect(vm.getVisibleLines()).toHaveLength(3);
    });

    it("starts from startLine when scrolled", () => {
      const vm = makeVM(makeStub({ lineCount: 10 }), 3, 3);
      const lines = vm.getVisibleLines();
      expect(lines[0].lineNumber).toBe(3);
      expect(lines[2].lineNumber).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // scrollBy / setScrollPosition
  // -------------------------------------------------------------------------

  describe("scrollBy (Vertical)", () => {
    it("advances scrollTop by given delta", () => {
      const vm = makeVM(makeStub({ lineCount: 20 }), 0, 5);
      vm.scrollBy(0, 3 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(3 * LINE_HEIGHT);
      expect(vm.getViewportStart()).toBe(3);
    });

    it("clamps at the last possible scroll top", () => {
      // scrollHeight = 0 + 10*LINE_HEIGHT + LINE_HEIGHT = 11*LINE_HEIGHT
      // maxScrollTop = 11*LINE_HEIGHT - 5*LINE_HEIGHT = 6*LINE_HEIGHT
      const vm = makeVM(makeStub({ lineCount: 10 }), 0, 5);
      vm.scrollBy(0, 100 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(6 * LINE_HEIGHT);
    });

    it("does not scroll past the end when document smaller than viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 3 }), 0, 5);
      vm.scrollBy(0, 10 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(0);
    });

    it("handles scrolling up", () => {
      const vm = makeVM(makeStub({ lineCount: 20 }), 5, 5);
      vm.scrollBy(0, -3 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(2 * LINE_HEIGHT);
    });

    it("clamps at scrollTop 0", () => {
      const vm = makeVM(makeStub({ lineCount: 20 }), 2, 5);
      vm.scrollBy(0, -100 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(0);
    });
  });

  describe("scrollBy (Horizontal)", () => {
    it("advances scrollLeft by given delta", () => {
      const vm = makeVM(makeStub({ lineCount: 10, maxLineLength: 100 }), 0, 5);
      vm.scrollBy(5 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(5 * CHAR_WIDTH);
    });

    it("clamps at max line length plus padding", () => {
      // line length 50, viewport 80 -> no scrolling allowed
      const vm = makeVM(makeStub({ lineCount: 10, maxLineLength: 50 }), 0, 5, 80);
      vm.scrollBy(100 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(0);
    });

    it("scrollLeft clamps properly with custom viewport constraints", () => {
      // length 100, viewport 80, padding 3
      // maxScroll = (100 + 3) * CHAR_WIDTH - 80 * CHAR_WIDTH = 23 * CHAR_WIDTH
      const vm = makeVM(makeStub({ lineCount: 10, maxLineLength: 100 }), 0, 5, 80);
      vm.scrollBy(1000 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(23 * CHAR_WIDTH);
    });

    it("scrolls horizontally in both directions safely", () => {
      const vm = makeVM(makeStub({ lineCount: 10, maxLineLength: 100 }), 0, 5, 80);
      vm.scrollBy(10 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(10 * CHAR_WIDTH);
      vm.scrollBy(-3 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(7 * CHAR_WIDTH);
      vm.scrollBy(-100 * CHAR_WIDTH, 0);
      expect(vm.getScrollLeft()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // isCursorVisible
  // -------------------------------------------------------------------------

  describe("isCursorVisible", () => {
    it("returns true when cursor is on the first visible line", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorLine: 0 }), 0, 5);
      expect(vm.isCursorVisible()).toBe(true);
    });

    it("returns true when cursor is on the last fully visible line", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorLine: 4 }), 0, 5);
      expect(vm.isCursorVisible()).toBe(true);
    });

    it("returns false when cursor is above the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorLine: 0 }), 3, 5);
      expect(vm.isCursorVisible()).toBe(false);
    });

    it("returns false when cursor is below the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorLine: 9 }), 0, 5);
      expect(vm.isCursorVisible()).toBe(false);
    });

    it("evaluates horizontally too - false if scrolled out to right", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorCol: 100, maxLineLength: 200 }), 0, 5, 40);
      // cursor is at 100, viewport is 0-40
      expect(vm.isCursorVisible()).toBe(false);
    });

    it("evaluates horizontally too - true if scrolled into view", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorCol: 100, maxLineLength: 200 }), 0, 5, 40);
      vm.scrollBy(80 * CHAR_WIDTH, 0); // scrollX is now 80, view is 80-120
      expect(vm.isCursorVisible()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Viewport Position Rescaling Arrays
  // -------------------------------------------------------------------------

  describe("Viewport Position Queries", () => {
    it("getCursorViewportPosition offsets by viewport start", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 7, cursorCol: 4 }), 5, 5);
      const pos = vm.getCursorViewportPosition();
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(4);
    });

    it("getAnchorViewportPosition offsets by viewport start", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 7, cursorCol: 4 }), 5, 5);
      const pos = vm.getAnchorViewportPosition();
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // scrollToCursor
  // -------------------------------------------------------------------------

  describe("scrollToCursor", () => {
    it("is a no-op when cursor is already vertically and horizontally visible", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorLine: 2 }), 0, 5);
      vm.scrollToCursor();
      expect(vm.getScrollTop()).toBe(0);
    });

    it("scrolls up when cursor is above the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 1 }), 5, 5);
      vm.scrollToCursor();
      expect(vm.getScrollTop()).toBe(1 * LINE_HEIGHT);
    });

    it("scrolls down when cursor is below the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 12 }), 0, 5);
      vm.scrollToCursor();
      // cursorBottom = 13*LINE_HEIGHT. Expected top = 13*LINE_HEIGHT - 5*LINE_HEIGHT = 8*LINE_HEIGHT
      expect(vm.getScrollTop()).toBe(8 * LINE_HEIGHT);
    });

    it("horizontally scrolls right when cursor is past right edge", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorCol: 90, maxLineLength: 200 }), 0, 5, 80);
      vm.scrollToCursor();
      // Required space: 90 chars. Viewport width: 80 chars. Scroll = 90 - 80 + padding(4)
      const expectedLeft = (90 - 80 + 4) * CHAR_WIDTH;
      expect(vm.getScrollLeft()).toBe(expectedLeft);
    });

    it("horizontally scrolls left when cursor is past left edge", () => {
      const vm = makeVM(makeStub({ lineCount: 10, cursorCol: 3, maxLineLength: 200 }), 0, 5, 80);
      vm.scrollBy(20 * CHAR_WIDTH, 0); // User scrolls manually away
      vm.scrollToCursor();
      // Cursor is at col 3. Needs padding -> top to max(0, 3*char - 4*char) = 0
      expect(vm.getScrollLeft()).toBe(0);
    });

    it("cursor is entirely visible after scrollToCursor", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 15, cursorCol: 150, maxLineLength: 300 }), 0, 5, 40);
      vm.scrollToCursor();
      expect(vm.isCursorVisible()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Re-clamping logic and window interactions
  // -------------------------------------------------------------------------

  describe("Viewport clamping upon resize", () => {
    it("dynamically adjusts scroll bounds when viewport grows", () => {
      // scrollHeight = 0 + 20*LINE_HEIGHT + LINE_HEIGHT = 21*LINE_HEIGHT
      // With 5-line viewport: maxScrollTop = 21*LINE_HEIGHT - 5*LINE_HEIGHT = 16*LINE_HEIGHT
      const vm = makeVM(makeStub({ lineCount: 20 }), 0, 5);
      vm.scrollBy(0, 100 * LINE_HEIGHT);
      expect(vm.getScrollTop()).toBe(16 * LINE_HEIGHT);

      // Expand window to show 10 lines. New max = 21*LINE_HEIGHT - 10*LINE_HEIGHT = 11*LINE_HEIGHT.
      vm.setViewport(800, 10 * LINE_HEIGHT, CHAR_WIDTH);
      expect(vm.getScrollTop()).toBe(11 * LINE_HEIGHT);
    });

    it("automatically re-clamps scroll position during content shrinkage", () => {
      let maxLen = 100;
      const stub = makeStub({
        lineCount: 10,
        maxLineLength: maxLen,
        overrides: { getMaxLineLength: () => maxLen },
      });
      const vm = makeVM(stub, 0, 5, 80);
      vm.scrollBy(200 * CHAR_WIDTH, 0);

      // Now scrollLeft is at maximum boundaries: (100 + 3 - 80) * CHAR_WIDTH = 23 * CHAR_WIDTH
      expect(vm.getScrollLeft()).toBe(23 * CHAR_WIDTH);

      // Simulate a deletion leaving longest line at length 30
      maxLen = 30;
      vm.getVisibleLines(); // Calls internal clamp function side-effect during React render

      // Clamps down to 0 because viewport > content width
      expect(vm.getScrollLeft()).toBe(0);
    });
  });
  
  // -------------------------------------------------------------------------
  // Delegation validation
  // -------------------------------------------------------------------------

  describe("execute / subscribe delegates to editor", () => {
    it("delegates to editor.subscribe", () => {
      const unsub = vi.fn();
      const stub = makeStub({
        lineCount: 10,
        overrides: { subscribe: vi.fn(() => unsub) },
      });
      const vm = makeVM(stub);
      const callback = vi.fn();
      const returned = vm.subscribe(callback);

      expect(stub.subscribe).toHaveBeenCalledWith(callback);
      expect(returned).toBe(unsub);
    });

    it("delegates to editor.execute", () => {
      const stub = makeStub({ lineCount: 10 });
      const vm = makeVM(stub);
      const cmd = { type: "insert_text" as const, text: "foo" };
      vm.execute(cmd);
      expect(stub.execute).toHaveBeenCalledWith(cmd);
    });
  });

  // -------------------------------------------------------------------------
  // Remote cursor viewport culling
  // -------------------------------------------------------------------------

  describe("getRemoteCursorsViewportPositions", () => {
    it("excludes remote cursors entirely above the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 5);
      vm.setRemoteCursors([
        { clientID: 1, user: { name: "A", color: "#f00" }, anchor: p(2, 0), head: p(2, 5) },
      ]);
      expect(vm.getRemoteCursorsViewportPositions()).toHaveLength(0);
    });

    it("excludes remote cursors entirely below the viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 0, 5);
      vm.setRemoteCursors([
        { clientID: 1, user: { name: "A", color: "#f00" }, anchor: p(50, 0), head: p(50, 5) },
      ]);
      expect(vm.getRemoteCursorsViewportPositions()).toHaveLength(0);
    });

    it("includes remote cursors within the viewport with correct relative positions", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 5);
      vm.setRemoteCursors([
        { clientID: 1, user: { name: "A", color: "#f00" }, anchor: p(12, 3), head: p(12, 8) },
      ]);
      const result = vm.getRemoteCursorsViewportPositions();
      expect(result).toHaveLength(1);
      expect(result[0].head.line).toBe(2);
      expect(result[0].head.column).toBe(8);
      expect(result[0].anchor.line).toBe(2);
      expect(result[0].anchor.column).toBe(3);
    });

    it("includes cursors with selection spanning the viewport boundary", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 5);
      // Selection starts above viewport but head is inside
      vm.setRemoteCursors([
        { clientID: 1, user: { name: "A", color: "#f00" }, anchor: p(5, 0), head: p(12, 4) },
      ]);
      const result = vm.getRemoteCursorsViewportPositions();
      expect(result).toHaveLength(1);
    });

    it("includes cursors whose anchor is inside viewport but head is below", () => {
      const vm = makeVM(makeStub({ lineCount: 100 }), 10, 5);
      vm.setRemoteCursors([
        { clientID: 1, user: { name: "A", color: "#f00" }, anchor: p(13, 0), head: p(20, 4) },
      ]);
      const result = vm.getRemoteCursorsViewportPositions();
      expect(result).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // topPadding
  // -------------------------------------------------------------------------

  describe("topPadding", () => {
    it("getScrollHeight includes topPadding and one LINE_HEIGHT of bottom padding", () => {
      const vm = makeVM(makeStub({ lineCount: 10 }), 0, 5);
      // Default: 0 + 10*LINE_HEIGHT + LINE_HEIGHT
      expect(vm.getScrollHeight()).toBe(11 * LINE_HEIGHT);

      vm.setTopPadding(LINE_HEIGHT);
      // 1*LINE_HEIGHT + 10*LINE_HEIGHT + LINE_HEIGHT
      expect(vm.getScrollHeight()).toBe(12 * LINE_HEIGHT);
    });

    it("getViewportStart accounts for topPadding offset", () => {
      const vm = makeVM(makeStub({ lineCount: 20 }), 0, 5);
      vm.setTopPadding(LINE_HEIGHT);
      // scrollTop=0 → (0 - LINE_HEIGHT) clamped to 0 → line 0
      expect(vm.getViewportStart()).toBe(0);

      // scrollTop = LINE_HEIGHT → (LINE_HEIGHT - LINE_HEIGHT)/LINE_HEIGHT = 0 → still line 0
      vm.setScrollPosition(0, LINE_HEIGHT);
      expect(vm.getViewportStart()).toBe(0);

      // scrollTop = 2*LINE_HEIGHT → (2*LINE_HEIGHT - LINE_HEIGHT)/LINE_HEIGHT = 1 → line 1
      vm.setScrollPosition(0, 2 * LINE_HEIGHT);
      expect(vm.getViewportStart()).toBe(1);
    });

    it("scrollToCursor scrolls to topPadding + cursorLine*LINE_HEIGHT when cursor is above viewport", () => {
      const vm = makeVM(makeStub({ lineCount: 20, cursorLine: 0 }), 5, 5);
      vm.setTopPadding(LINE_HEIGHT);
      // Effective cursor scroll-area top = LINE_HEIGHT + 0 = LINE_HEIGHT
      vm.scrollToCursor();
      expect(vm.getScrollTop()).toBe(LINE_HEIGHT);
    });

    it("getTopPadding returns the value set by setTopPadding", () => {
      const vm = makeVM(makeStub({ lineCount: 10 }), 0, 5);
      expect(vm.getTopPadding()).toBe(0);
      vm.setTopPadding(40);
      expect(vm.getTopPadding()).toBe(40);
    });

    it("setTopPadding clamps negative values to 0", () => {
      const vm = makeVM(makeStub({ lineCount: 10 }), 0, 5);
      vm.setTopPadding(-50);
      expect(vm.getTopPadding()).toBe(0);
    });
  });
});
