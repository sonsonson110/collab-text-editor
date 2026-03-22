import { describe, it, expect } from "vitest";
import { LineIndex } from "./lineIndex";
import { Position } from "@/core/position/position";

describe("LineIndex", () => {
  describe("rebuild / getLineCount", () => {
    it("empty string has one line", () => {
      const idx = new LineIndex("");
      expect(idx.getLineCount()).toBe(1);
    });

    it("single line with no newline has one line", () => {
      const idx = new LineIndex("hello");
      expect(idx.getLineCount()).toBe(1);
    });

    it("counts lines correctly for multiple newlines", () => {
      const idx = new LineIndex("a\nb\nc");
      expect(idx.getLineCount()).toBe(3);
    });

    it("trailing newline creates an extra empty line", () => {
      const idx = new LineIndex("a\nb\n");
      expect(idx.getLineCount()).toBe(3);
    });

    it("rebuild updates state correctly after a change", () => {
      const idx = new LineIndex("one line");
      expect(idx.getLineCount()).toBe(1);
      idx.rebuild("line one\nline two\nline three");
      expect(idx.getLineCount()).toBe(3);
    });
  });

  describe("getLineStart", () => {
    it("line 0 always starts at offset 0", () => {
      const idx = new LineIndex("anything");
      expect(idx.getLineStart(0)).toBe(0);
    });

    it("line 1 starts right after the first newline", () => {
      const idx = new LineIndex("abc\ndef");
      // 'abc' is 3 chars, '\n' is at index 3, so line 1 starts at 4
      expect(idx.getLineStart(1)).toBe(4);
    });

    it("line 2 starts at correct position", () => {
      const idx = new LineIndex("ab\ncd\nef");
      expect(idx.getLineStart(2)).toBe(6);
    });

    it("throws for a negative line number", () => {
      const idx = new LineIndex("hello");
      expect(() => idx.getLineStart(-1)).toThrow();
    });

    it("throws for a line number equal to line count", () => {
      const idx = new LineIndex("hello");
      // only line 0 exists
      expect(() => idx.getLineStart(1)).toThrow();
    });
  });

  describe("positionToOffset", () => {
    it("position (0, 0) maps to offset 0", () => {
      const idx = new LineIndex("hello\nworld");
      expect(idx.positionToOffset(new Position(0, 0))).toBe(0);
    });

    it("position within first line maps correctly", () => {
      const idx = new LineIndex("hello\nworld");
      // 'h'=0 'e'=1 'l'=2 'l'=3 'o'=4
      expect(idx.positionToOffset(new Position(0, 3))).toBe(3);
    });

    it("position at start of second line maps to first char after newline", () => {
      const idx = new LineIndex("hello\nworld");
      // 'hello' = 5 chars, '\n' at 5, line 1 starts at 6
      expect(idx.positionToOffset(new Position(1, 0))).toBe(6);
    });

    it("position within second line maps correctly", () => {
      const idx = new LineIndex("hello\nworld");
      expect(idx.positionToOffset(new Position(1, 3))).toBe(9);
    });
  });

  describe("offsetToPosition", () => {
    it("offset 0 maps to (0, 0)", () => {
      const idx = new LineIndex("hello\nworld");
      const pos = idx.offsetToPosition(0);
      expect(pos.line).toBe(0);
      expect(pos.column).toBe(0);
    });

    it("offset within first line maps to correct column on line 0", () => {
      const idx = new LineIndex("hello\nworld");
      const pos = idx.offsetToPosition(3);
      expect(pos.line).toBe(0);
      expect(pos.column).toBe(3);
    });

    it("offset at the newline character maps to end of line 0", () => {
      const idx = new LineIndex("hello\nworld");
      // '\n' is at offset 5 — still belongs to line 0 column 5
      const pos = idx.offsetToPosition(5);
      expect(pos.line).toBe(0);
      expect(pos.column).toBe(5);
    });

    it("offset at start of second line maps to (1, 0)", () => {
      const idx = new LineIndex("hello\nworld");
      // line 1 starts at offset 6
      const pos = idx.offsetToPosition(6);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(0);
    });

    it("offset within second line maps to correct column", () => {
      const idx = new LineIndex("hello\nworld");
      const pos = idx.offsetToPosition(9);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(3);
    });

    it("last offset in document maps to last line and column", () => {
      const text = "ab\ncd";
      const idx = new LineIndex(text);
      // last char 'd' is at offset 4
      const pos = idx.offsetToPosition(4);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(1);
    });

    it("throws for negative offset", () => {
      const idx = new LineIndex("hello");
      expect(() => idx.offsetToPosition(-1)).toThrow();
    });
  });

  describe("round-trip: positionToOffset → offsetToPosition", () => {
    it("round-trips position on line 0", () => {
      const idx = new LineIndex("hello\nworld\nfoo");
      const original = new Position(0, 4);
      const offset = idx.positionToOffset(original);
      const back = idx.offsetToPosition(offset);
      expect(back.line).toBe(original.line);
      expect(back.column).toBe(original.column);
    });

    it("round-trips position on line 1", () => {
      const idx = new LineIndex("hello\nworld\nfoo");
      const original = new Position(1, 3);
      const offset = idx.positionToOffset(original);
      const back = idx.offsetToPosition(offset);
      expect(back.line).toBe(original.line);
      expect(back.column).toBe(original.column);
    });

    it("round-trips position on last line", () => {
      const idx = new LineIndex("hello\nworld\nfoo");
      const original = new Position(2, 2);
      const offset = idx.positionToOffset(original);
      const back = idx.offsetToPosition(offset);
      expect(back.line).toBe(original.line);
      expect(back.column).toBe(original.column);
    });
  });
});
