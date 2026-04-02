import { describe, it, expect } from "vitest";
import {
  buildSelectionRects,
  getWordSelection,
  mapKeyboardEvent,
} from "./utils";
import type React from "react";

describe("UI Utils", () => {
  describe("getWordSelection", () => {
    it("should return 0,0 for empty line", () => {
      expect(getWordSelection("", 0)).toEqual({ start: 0, end: 0 });
    });

    it("should select a word properly", () => {
      const line = "hello world test";
      // Clicking 'h'
      expect(getWordSelection(line, 0)).toEqual({ start: 0, end: 5 });
      // Clicking 'o'
      expect(getWordSelection(line, 4)).toEqual({ start: 0, end: 5 });
      // Clicking 'w'
      expect(getWordSelection(line, 6)).toEqual({ start: 6, end: 11 });
    });

    it("should select whitespace properly", () => {
      const line = "hello   world";
      expect(getWordSelection(line, 5)).toEqual({ start: 5, end: 8 });
      expect(getWordSelection(line, 6)).toEqual({ start: 5, end: 8 });
    });

    it("should select punctuation properly", () => {
      const line = "hello!!??world";
      // Clicking first '!', only that one should be selected
      expect(getWordSelection(line, 5)).toEqual({ start: 5, end: 6 });
      // Clicking '?'
      expect(getWordSelection(line, 7)).toEqual({ start: 7, end: 8 });
    });

    it("should clamp if column is out of bounds", () => {
      const line = "hello";
      // Out of bounds will clamp to last char 'o', and select "hello"
      expect(getWordSelection(line, 10)).toEqual({ start: 0, end: 5 });
    });
  });

  describe("buildSelectionRects", () => {
    it("should return empty array if same position", () => {
      expect(
        buildSelectionRects(
          { line: 0, column: 5 },
          { line: 0, column: 5 },
          () => 10,
          10,
        ),
      ).toEqual([]);
    });

    it("should build single rect for single-line selection", () => {
      expect(
        buildSelectionRects(
          { line: 0, column: 2 },
          { line: 0, column: 8 },
          () => 10,
          10,
        ),
      ).toEqual([{ line: 0, startCol: 2, endCol: 8 }]);
    });

    it("should build multiple rects for multi-line selection", () => {
      const res = buildSelectionRects(
        { line: 0, column: 5 },
        { line: 2, column: 3 },
        (line) => (line === 0 ? 10 : line === 1 ? 8 : 12),
        10,
      );
      expect(res).toEqual([
        { line: 0, startCol: 5, endCol: 11 },
        { line: 1, startCol: 0, endCol: 9 },
        { line: 2, startCol: 0, endCol: 3 },
      ]);
    });

    it("should ignore lines outside visible count", () => {
      const res = buildSelectionRects(
        { line: -1, column: 0 },
        { line: 1, column: 3 },
        () => 10,
        1, // Only 1 visible line
      );
      expect(res.length).toBe(1);
      expect(res[0]).toEqual({ line: 0, startCol: 0, endCol: 11 }); // clamped visibleLineCount
    });
  });

  describe("mapKeyboardEvent", () => {
    const createEvent = (
      key: string,
      ctrlKey = false,
      metaKey = false,
      shiftKey = false,
    ) =>
      ({
        key,
        ctrlKey,
        metaKey,
        shiftKey,
      }) as React.KeyboardEvent;

    it("should map undo", () => {
      expect(mapKeyboardEvent(createEvent("z", true))).toEqual({
        type: "undo",
      });
    });

    it("should map redo on shift+ctrl+z", () => {
      expect(mapKeyboardEvent(createEvent("z", true, false, true))).toEqual({
        type: "redo",
      });
    });

    it("should map redo on ctrl+y", () => {
      expect(mapKeyboardEvent(createEvent("y", true))).toEqual({
        type: "redo",
      });
    });

    it("should map ordinary insertion", () => {
      expect(mapKeyboardEvent(createEvent("a"))).toEqual({
        type: "insert_text",
        text: "a",
      });
    });

    it("should map special keys", () => {
      expect(mapKeyboardEvent(createEvent("Enter"))).toEqual({
        type: "insert_text",
        text: "\n",
      });
      expect(mapKeyboardEvent(createEvent("Backspace"))).toEqual({
        type: "delete_backward",
      });

      expect(mapKeyboardEvent(createEvent("ArrowLeft"))).toEqual({
        type: "move_cursor",
        direction: "left",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("ArrowRight"))).toEqual({
        type: "move_cursor",
        direction: "right",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("ArrowUp"))).toEqual({
        type: "move_cursor",
        direction: "up",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("ArrowDown"))).toEqual({
        type: "move_cursor",
        direction: "down",
        select: false,
      });

      expect(mapKeyboardEvent(createEvent("Home"))).toEqual({
        type: "move_cursor",
        direction: "lineStart",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("End"))).toEqual({
        type: "move_cursor",
        direction: "lineEnd",
        select: false,
      });
    });

    it("should map word traversal and deletion keys with Ctrl/Cmd", () => {
      expect(mapKeyboardEvent(createEvent("ArrowLeft", true))).toEqual({
        type: "move_cursor",
        direction: "wordLeft",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("ArrowRight", true))).toEqual({
        type: "move_cursor",
        direction: "wordRight",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("Backspace", true))).toEqual({
        type: "delete_backward",
        granularity: "word",
      });
      expect(mapKeyboardEvent(createEvent("Delete", true))).toEqual({
        type: "delete_forward",
        granularity: "word",
      });
    });

    it("should map word traversal with selection keys with Shift + Ctrl/Cmd", () => {
      expect(mapKeyboardEvent(createEvent("ArrowLeft", true, false, true))).toEqual({
        type: "move_cursor",
        direction: "wordLeft",
        select: true,
      });
      expect(mapKeyboardEvent(createEvent("ArrowRight", true, false, true))).toEqual({
        type: "move_cursor",
        direction: "wordRight",
        select: true,
      });
    });

    it("should map extend selection keys with Shift", () => {
      expect(
        mapKeyboardEvent(createEvent("ArrowLeft", false, false, true)),
      ).toEqual({ type: "move_cursor", direction: "left", select: true });
      expect(
        mapKeyboardEvent(createEvent("ArrowRight", false, false, true)),
      ).toEqual({ type: "move_cursor", direction: "right", select: true });
      expect(
        mapKeyboardEvent(createEvent("ArrowUp", false, false, true)),
      ).toEqual({ type: "move_cursor", direction: "up", select: true });
      expect(
        mapKeyboardEvent(createEvent("ArrowDown", false, false, true)),
      ).toEqual({ type: "move_cursor", direction: "down", select: true });
      expect(mapKeyboardEvent(createEvent("Home", false, false, true))).toEqual(
        { type: "move_cursor", direction: "lineStart", select: true },
      );
      expect(mapKeyboardEvent(createEvent("End", false, false, true))).toEqual({
        type: "move_cursor",
        direction: "lineEnd",
        select: true,
      });
    });

    it("should map document navigation", () => {
      expect(mapKeyboardEvent(createEvent("Home", true))).toEqual({
        type: "move_cursor",
        direction: "documentStart",
        select: false,
      });
      expect(mapKeyboardEvent(createEvent("End", true))).toEqual({
        type: "move_cursor",
        direction: "documentEnd",
        select: false,
      });

      // With Shift
      expect(mapKeyboardEvent(createEvent("Home", true, false, true))).toEqual({
        type: "move_cursor",
        direction: "documentStart",
        select: true,
      });
      expect(mapKeyboardEvent(createEvent("End", true, false, true))).toEqual({
        type: "move_cursor",
        direction: "documentEnd",
        select: true,
      });
    });

    it("should map select all", () => {
      expect(mapKeyboardEvent(createEvent("a", true))).toEqual({
        type: "select_all",
      });
      expect(mapKeyboardEvent(createEvent("A", true))).toEqual({
        type: "select_all",
      });
    });

    it("should return null for unmatched complex shortcuts", () => {
      // e.g. Ctrl + B (not implemented in the map)
      expect(mapKeyboardEvent(createEvent("b", true))).toBeNull();
    });
  });
});
