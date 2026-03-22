import { describe, it, expect } from "vitest";
import { Position } from "./position";

describe("Position", () => {
  describe("isBefore", () => {
    it("returns true when line is smaller", () => {
      const a = new Position(1, 5);
      const b = new Position(2, 0);
      expect(a.isBefore(b)).toBe(true);
    });

    it("returns true when same line but column is smaller", () => {
      const a = new Position(1, 3);
      const b = new Position(1, 7);
      expect(a.isBefore(b)).toBe(true);
    });

    it("returns false when equal", () => {
      const a = new Position(1, 3);
      const b = new Position(1, 3);
      expect(a.isBefore(b)).toBe(false);
    });

    it("returns false when line is greater", () => {
      const a = new Position(3, 0);
      const b = new Position(2, 10);
      expect(a.isBefore(b)).toBe(false);
    });

    it("returns false when same line but column is greater", () => {
      const a = new Position(1, 8);
      const b = new Position(1, 3);
      expect(a.isBefore(b)).toBe(false);
    });
  });

  describe("isAfter", () => {
    it("returns true when line is greater", () => {
      const a = new Position(3, 0);
      const b = new Position(1, 9);
      expect(a.isAfter(b)).toBe(true);
    });

    it("returns true when same line but column is greater", () => {
      const a = new Position(2, 9);
      const b = new Position(2, 4);
      expect(a.isAfter(b)).toBe(true);
    });

    it("returns false when equal", () => {
      const a = new Position(0, 0);
      const b = new Position(0, 0);
      expect(a.isAfter(b)).toBe(false);
    });

    it("returns false when line is smaller", () => {
      const a = new Position(0, 5);
      const b = new Position(2, 0);
      expect(a.isAfter(b)).toBe(false);
    });
  });

  describe("isEqual", () => {
    it("returns true when line and column match", () => {
      const a = new Position(4, 7);
      const b = new Position(4, 7);
      expect(a.isEqual(b)).toBe(true);
    });

    it("returns false when only line differs", () => {
      const a = new Position(3, 7);
      const b = new Position(4, 7);
      expect(a.isEqual(b)).toBe(false);
    });

    it("returns false when only column differs", () => {
      const a = new Position(4, 6);
      const b = new Position(4, 7);
      expect(a.isEqual(b)).toBe(false);
    });
  });

  describe("ordering consistency", () => {
    it("isBefore and isAfter are mutually exclusive for distinct positions", () => {
      const a = new Position(0, 5);
      const b = new Position(1, 0);
      expect(a.isBefore(b)).toBe(true);
      expect(a.isAfter(b)).toBe(false);
    });

    it("neither isBefore nor isAfter when equal", () => {
      const a = new Position(2, 3);
      const b = new Position(2, 3);
      expect(a.isBefore(b)).toBe(false);
      expect(a.isAfter(b)).toBe(false);
    });
  });
});