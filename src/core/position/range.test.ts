import { describe, it, expect } from "vitest";
import { Position } from "./position";
import { Range } from "./range";

describe("Range", () => {
  describe("constructor normalisation", () => {
    it("keeps start and end as-is when start is before end", () => {
      const start = new Position(0, 2);
      const end = new Position(0, 8);
      const range = new Range(start, end);
      expect(range.start.isEqual(start)).toBe(true);
      expect(range.end.isEqual(end)).toBe(true);
    });

    it("swaps start and end when end is before start", () => {
      const first = new Position(0, 2);
      const second = new Position(0, 8);
      // pass in reversed order
      const range = new Range(second, first);
      expect(range.start.isEqual(first)).toBe(true);
      expect(range.end.isEqual(second)).toBe(true);
    });

    it("normalises across lines", () => {
      const earlier = new Position(1, 0);
      const later = new Position(3, 5);
      const range = new Range(later, earlier);
      expect(range.start.isEqual(earlier)).toBe(true);
      expect(range.end.isEqual(later)).toBe(true);
    });

    it("accepts equal start and end (empty range)", () => {
      const pos = new Position(2, 4);
      const range = new Range(pos, pos);
      expect(range.start.isEqual(pos)).toBe(true);
      expect(range.end.isEqual(pos)).toBe(true);
    });
  });

  describe("isEmpty", () => {
    it("returns true when start equals end", () => {
      const pos = new Position(1, 5);
      const range = new Range(pos, pos);
      expect(range.isEmpty()).toBe(true);
    });

    it("returns false when start and end differ on same line", () => {
      const range = new Range(new Position(1, 3), new Position(1, 7));
      expect(range.isEmpty()).toBe(false);
    });

    it("returns false when start and end are on different lines", () => {
      const range = new Range(new Position(0, 0), new Position(1, 0));
      expect(range.isEmpty()).toBe(false);
    });
  });

  describe("contains", () => {
    it("returns true for a position strictly inside the range", () => {
      const range = new Range(new Position(0, 2), new Position(0, 8));
      expect(range.contains(new Position(0, 5))).toBe(true);
    });

    it("returns true for the start position (inclusive)", () => {
      const start = new Position(0, 2);
      const range = new Range(start, new Position(0, 8));
      expect(range.contains(start)).toBe(true);
    });

    it("returns true for the end position (inclusive)", () => {
      const end = new Position(0, 8);
      const range = new Range(new Position(0, 2), end);
      expect(range.contains(end)).toBe(true);
    });

    it("returns false for a position before the range", () => {
      const range = new Range(new Position(0, 5), new Position(0, 10));
      expect(range.contains(new Position(0, 3))).toBe(false);
    });

    it("returns false for a position after the range", () => {
      const range = new Range(new Position(0, 5), new Position(0, 10));
      expect(range.contains(new Position(0, 11))).toBe(false);
    });

    it("returns true for a position on a line between start and end lines", () => {
      const range = new Range(new Position(1, 0), new Position(3, 0));
      expect(range.contains(new Position(2, 99))).toBe(true);
    });

    it("returns false for a position on a line before start line", () => {
      const range = new Range(new Position(2, 0), new Position(4, 0));
      expect(range.contains(new Position(1, 5))).toBe(false);
    });
  });
});