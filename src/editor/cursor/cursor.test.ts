import { describe, it, expect } from "vitest";
import { Cursor } from "./cursor";
import { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

const p = (line: number, col: number) => new Position(line, col);

describe("Cursor", () => {
  describe("constructor", () => {
    it("sets anchor and active to same position when only anchor is given", () => {
      const cursor = new Cursor(p(1, 3));
      expect(cursor.anchor.isEqual(p(1, 3))).toBe(true);
      expect(cursor.active.isEqual(p(1, 3))).toBe(true);
    });

    it("sets anchor and active independently when both are given", () => {
      const cursor = new Cursor(p(0, 0), p(1, 5));
      expect(cursor.anchor.isEqual(p(0, 0))).toBe(true);
      expect(cursor.active.isEqual(p(1, 5))).toBe(true);
    });
  });

  describe("isCollapsed", () => {
    it("returns true when only anchor is given", () => {
      expect(new Cursor(p(0, 0)).isCollapsed()).toBe(true);
    });

    it("returns true when both positions are explicitly equal", () => {
      expect(new Cursor(p(2, 4), p(2, 4)).isCollapsed()).toBe(true);
    });

    it("returns false when anchor and active differ on same line", () => {
      expect(new Cursor(p(0, 0), p(0, 5)).isCollapsed()).toBe(false);
    });

    it("returns false for a multi-line selection", () => {
      expect(new Cursor(p(0, 0), p(3, 0)).isCollapsed()).toBe(false);
    });
  });

  describe("getStart", () => {
    it("returns anchor when anchor is before active", () => {
      const cursor = new Cursor(p(0, 0), p(0, 5));
      expect(cursor.getStart().isEqual(p(0, 0))).toBe(true);
    });

    it("returns active when active is before anchor (backward selection)", () => {
      const cursor = new Cursor(p(0, 8), p(0, 2));
      expect(cursor.getStart().isEqual(p(0, 2))).toBe(true);
    });

    it("returns anchor when collapsed", () => {
      const cursor = new Cursor(p(1, 4));
      expect(cursor.getStart().isEqual(p(1, 4))).toBe(true);
    });

    it("handles multi-line backward selection", () => {
      const cursor = new Cursor(p(3, 0), p(1, 5));
      expect(cursor.getStart().isEqual(p(1, 5))).toBe(true);
    });
  });

  describe("getEnd", () => {
    it("returns active when anchor is before active", () => {
      const cursor = new Cursor(p(0, 0), p(0, 5));
      expect(cursor.getEnd().isEqual(p(0, 5))).toBe(true);
    });

    it("returns anchor when active is before anchor (backward selection)", () => {
      const cursor = new Cursor(p(0, 8), p(0, 2));
      expect(cursor.getEnd().isEqual(p(0, 8))).toBe(true);
    });

    it("handles multi-line forward selection", () => {
      const cursor = new Cursor(p(1, 0), p(3, 5));
      expect(cursor.getEnd().isEqual(p(3, 5))).toBe(true);
    });
  });

  describe("toRange", () => {
    it("produces an empty range when collapsed", () => {
      const range = new Cursor(p(1, 3)).toRange();
      expect(range instanceof Range).toBe(true);
      expect(range.isEmpty()).toBe(true);
    });

    it("produces a normalised range for a backward selection", () => {
      const range = new Cursor(p(0, 8), p(0, 2)).toRange();
      expect(range.start.isEqual(p(0, 2))).toBe(true);
      expect(range.end.isEqual(p(0, 8))).toBe(true);
    });

    it("range start/end match getStart/getEnd", () => {
      const cursor = new Cursor(p(0, 0), p(2, 5));
      const range = cursor.toRange();
      expect(range.start.isEqual(cursor.getStart())).toBe(true);
      expect(range.end.isEqual(cursor.getEnd())).toBe(true);
    });
  });

  describe("moveTo", () => {
    it("returns a new collapsed cursor at the target position", () => {
      const moved = new Cursor(p(0, 0), p(0, 5)).moveTo(p(2, 3));
      expect(moved.isCollapsed()).toBe(true);
      expect(moved.active.isEqual(p(2, 3))).toBe(true);
    });

    it("does not mutate the original cursor", () => {
      const cursor = new Cursor(p(1, 1));
      cursor.moveTo(p(5, 5));
      expect(cursor.active.isEqual(p(1, 1))).toBe(true);
    });
  });

  describe("setActive", () => {
    it("keeps anchor fixed and updates active", () => {
      const extended = new Cursor(p(0, 0)).setActive(p(0, 10));
      expect(extended.anchor.isEqual(p(0, 0))).toBe(true);
      expect(extended.active.isEqual(p(0, 10))).toBe(true);
    });

    it("creates a selection when active differs from anchor", () => {
      expect(new Cursor(p(1, 0)).setActive(p(3, 5)).isCollapsed()).toBe(false);
    });

    it("does not mutate the original cursor", () => {
      const cursor = new Cursor(p(0, 0));
      cursor.setActive(p(0, 10));
      expect(cursor.isCollapsed()).toBe(true);
    });
  });

  describe("collapseToStart", () => {
    it("collapses to earlier position for a forward selection", () => {
      const collapsed = new Cursor(p(0, 2), p(0, 8)).collapseToStart();
      expect(collapsed.isCollapsed()).toBe(true);
      expect(collapsed.active.isEqual(p(0, 2))).toBe(true);
    });

    it("collapses to earlier position for a backward selection", () => {
      const collapsed = new Cursor(p(0, 8), p(0, 2)).collapseToStart();
      expect(collapsed.isCollapsed()).toBe(true);
      expect(collapsed.active.isEqual(p(0, 2))).toBe(true);
    });

    it("is a no-op on an already collapsed cursor", () => {
      const collapsed = new Cursor(p(2, 4)).collapseToStart();
      expect(collapsed.active.isEqual(p(2, 4))).toBe(true);
    });
  });

  describe("collapseToEnd", () => {
    it("collapses to later position for a forward selection", () => {
      const collapsed = new Cursor(p(0, 2), p(0, 8)).collapseToEnd();
      expect(collapsed.isCollapsed()).toBe(true);
      expect(collapsed.active.isEqual(p(0, 8))).toBe(true);
    });

    it("collapses to later position for a backward selection", () => {
      const collapsed = new Cursor(p(0, 8), p(0, 2)).collapseToEnd();
      expect(collapsed.isCollapsed()).toBe(true);
      expect(collapsed.active.isEqual(p(0, 8))).toBe(true);
    });
  });

  describe("isAtStart", () => {
    it("returns true only when collapsed at (0, 0)", () => {
      expect(new Cursor(p(0, 0)).isAtStart()).toBe(true);
    });

    it("returns false when collapsed at column > 0", () => {
      expect(new Cursor(p(0, 1)).isAtStart()).toBe(false);
    });

    it("returns false when collapsed on a line > 0", () => {
      expect(new Cursor(p(1, 0)).isAtStart()).toBe(false);
    });

    it("returns false when not collapsed, even if active is at (0, 0)", () => {
      expect(new Cursor(p(0, 0), p(0, 5)).isAtStart()).toBe(false);
    });
  });
});