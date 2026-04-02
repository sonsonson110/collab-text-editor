import { describe, it, expect } from "vitest";
import { getWordLeftOffset, getWordRightOffset } from "./utils";

describe("core utils", () => {
  describe("getWordLeftOffset", () => {
    it("returns 0 if offset is at start", () => {
      expect(getWordLeftOffset("hello", 0)).toBe(0);
    });

    it("skips trailing spaces and matches word backward", () => {
      // "hello   " -> ""
      expect(getWordLeftOffset("hello   ", 8)).toBe(0);
    });

    it("stops matching at punctuation", () => {
      expect(getWordLeftOffset("hello... world", 8)).toBe(5); // goes to start of "..."
    });

    it("stops right after a newline", () => {
      // jump back from the end of word "world", should stop before the newline
      expect(getWordLeftOffset("hello\nworld", 11)).toBe(6);
    });

    it("stops exactly at newline if right next to it", () => {
      expect(getWordLeftOffset("hello\n", 6)).toBe(5);
    });

    it("skips backward over whitespace right after newline", () => {
      // offset is at the right of spaces
      expect(getWordLeftOffset("hello\n  ", 8)).toBe(6);
    });
  });

  describe("getWordRightOffset", () => {
    it("returns length if offset is at end", () => {
      expect(getWordRightOffset("hello", 5)).toBe(5);
    });

    it("skips whitespace and then word characters", () => {
      expect(getWordRightOffset("   hello", 0)).toBe(8);
    });

    it("skips over the word and stops before next word", () => {
      expect(getWordRightOffset("hello world", 0)).toBe(5); // stays at the space before world
    });

    it("skips over punctuation", () => {
      expect(getWordRightOffset("hello... world", 5)).toBe(8);
    });

    it("jumps exactly to newline + 1 if at a newline", () => {
      expect(getWordRightOffset("hello\nworld", 5)).toBe(6);
    });

    it("stops right before newline if traversing whitespace to it", () => {
      expect(getWordRightOffset("hello  \nworld", 5)).toBe(7);
    });
  });
});
