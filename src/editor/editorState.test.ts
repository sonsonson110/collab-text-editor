import { describe, it, expect, vi } from "vitest";
import { EditorState } from "./editorState";
import { Document } from "@/core/document/document";
import { Cursor } from "@/editor/cursor/cursor";
import { Position } from "@/core/position/position";

const p = (line: number, col: number) => new Position(line, col);

function makeEditor(text: string, cursorPos = p(0, 0), anchorPos?: Position) {
  const doc = new Document(text);
  const cursor = anchorPos
    ? new Cursor(anchorPos, cursorPos)
    : new Cursor(cursorPos);
  return new EditorState(doc, cursor);
}

describe("EditorState", () => {
  describe("insert_text", () => {
    it("inserts at cursor position and advances cursor", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "insert_text", text: "!" });
      expect(editor.getLineContent(0)).toBe("hello!");
      expect(editor.getCursor().active.isEqual(p(0, 6))).toBe(true);
    });

    it("inserts at the start of the document", () => {
      const editor = makeEditor("world", p(0, 0));
      editor.execute({ type: "insert_text", text: "hello " });
      expect(editor.getLineContent(0)).toBe("hello world");
      expect(editor.getCursor().active.isEqual(p(0, 6))).toBe(true);
    });

    it("inserting a newline moves cursor to (nextLine, 0)", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "insert_text", text: "\n" });
      expect(editor.getLineCount()).toBe(2);
      expect(editor.getCursor().active.isEqual(p(1, 0))).toBe(true);
    });

    it("replaces a forward selection with typed text", () => {
      const editor = makeEditor("hello world", p(0, 5), p(0, 0));
      editor.execute({ type: "insert_text", text: "bye" });
      expect(editor.getLineContent(0)).toBe("bye world");
      expect(editor.getCursor().active.isEqual(p(0, 3))).toBe(true);
    });

    it("replaces a backward selection with typed text", () => {
      const editor = makeEditor("hello world", p(0, 0), p(0, 5));
      editor.execute({ type: "insert_text", text: "X" });
      expect(editor.getLineContent(0)).toBe("X world");
    });

    it("cursor is collapsed after inserting over a selection", () => {
      const editor = makeEditor("hello", p(0, 5), p(0, 0));
      editor.execute({ type: "insert_text", text: "A" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
    });
  });

  describe("delete_backward", () => {
    it("deletes the character before the cursor", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "delete_backward" });
      expect(editor.getLineContent(0)).toBe("hell");
      expect(editor.getCursor().active.isEqual(p(0, 4))).toBe(true);
    });

    it("deletes a newline and merges lines", () => {
      const editor = makeEditor("hello\nworld", p(1, 0));
      editor.execute({ type: "delete_backward" });
      expect(editor.getLineCount()).toBe(1);
      expect(editor.getLineContent(0)).toBe("helloworld");
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
    });

    it("is a no-op at the very start of the document", () => {
      const editor = makeEditor("hello", p(0, 0));
      editor.execute({ type: "delete_backward" });
      expect(editor.getLineContent(0)).toBe("hello");
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("deletes a selection instead of a single character", () => {
      const editor = makeEditor("hello world", p(0, 5), p(0, 0));
      editor.execute({ type: "delete_backward" });
      expect(editor.getLineContent(0)).toBe(" world");
    });

    it("cursor collapses to selection start after deleting selection", () => {
      const editor = makeEditor("abcde", p(0, 4), p(0, 1));
      editor.execute({ type: "delete_backward" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
      expect(editor.getCursor().active.isEqual(p(0, 1))).toBe(true);
    });
  });

  describe("delete_forward", () => {
    it("deletes the character after the cursor", () => {
      const editor = makeEditor("hello", p(0, 0));
      editor.execute({ type: "delete_forward" });
      expect(editor.getLineContent(0)).toBe("ello");
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("deletes a newline and merges lines", () => {
      const editor = makeEditor("hello\nworld", p(0, 5));
      editor.execute({ type: "delete_forward" });
      expect(editor.getLineCount()).toBe(1);
      expect(editor.getLineContent(0)).toBe("helloworld");
    });

    it("is a no-op at the end of the document", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "delete_forward" });
      expect(editor.getLineContent(0)).toBe("hello");
    });

    it("deletes a selection instead of a single character", () => {
      const editor = makeEditor("hello world", p(0, 5), p(0, 0));
      editor.execute({ type: "delete_forward" });
      expect(editor.getLineContent(0)).toBe(" world");
    });

    it("cursor stays at range start after deleting selection", () => {
      const editor = makeEditor("hello world", p(0, 5), p(0, 0));
      editor.execute({ type: "delete_forward" });
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });
  });

  describe("move_cursor left/right", () => {
    it("moves left by one character", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "left" });
      expect(editor.getCursor().active.isEqual(p(0, 2))).toBe(true);
    });

    it("moves right by one character", () => {
      const editor = makeEditor("hello", p(0, 2));
      editor.execute({ type: "move_cursor", direction: "right" });
      expect(editor.getCursor().active.isEqual(p(0, 3))).toBe(true);
    });

    it("left at offset 0 is a no-op", () => {
      const editor = makeEditor("hello", p(0, 0));
      editor.execute({ type: "move_cursor", direction: "left" });
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("right at end of document is a no-op", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "move_cursor", direction: "right" });
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
    });

    it("left across newline moves to end of previous line", () => {
      const editor = makeEditor("hello\nworld", p(1, 0));
      editor.execute({ type: "move_cursor", direction: "left" });
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
    });

    it("right across newline moves to start of next line", () => {
      const editor = makeEditor("hello\nworld", p(0, 5));
      editor.execute({ type: "move_cursor", direction: "right" });
      expect(editor.getCursor().active.isEqual(p(1, 0))).toBe(true);
    });

    it("left collapses a forward selection to start without moving", () => {
      const editor = makeEditor("hello", p(0, 5), p(0, 0));
      editor.execute({ type: "move_cursor", direction: "left" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("right collapses a forward selection to end without moving", () => {
      const editor = makeEditor("hello", p(0, 5), p(0, 0));
      editor.execute({ type: "move_cursor", direction: "right" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
    });

    it("extends selection to the left", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "left", select: true });
      expect(editor.getCursor().isCollapsed()).toBe(false);
      expect(editor.getCursor().active.isEqual(p(0, 2))).toBe(true);
      expect(editor.getCursor().anchor.isEqual(p(0, 3))).toBe(true);
    });

    it("extends selection to the right", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "right", select: true });
      expect(editor.getCursor().isCollapsed()).toBe(false);
      expect(editor.getCursor().active.isEqual(p(0, 4))).toBe(true);
      expect(editor.getCursor().anchor.isEqual(p(0, 3))).toBe(true);
    });
  });

  describe("move_cursor up/down", () => {
    it("moves up to same column on the previous line", () => {
      const editor = makeEditor("hello\nworld", p(1, 3));
      editor.execute({ type: "move_cursor", direction: "up" });
      expect(editor.getCursor().active.isEqual(p(0, 3))).toBe(true);
    });

    it("moves down to same column on the next line", () => {
      const editor = makeEditor("hello\nworld", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "down" });
      expect(editor.getCursor().active.isEqual(p(1, 3))).toBe(true);
    });

    it("clamps column when moving up to a shorter line", () => {
      const editor = makeEditor("hi\nhello world", p(1, 10));
      editor.execute({ type: "move_cursor", direction: "up" });
      expect(editor.getCursor().active.isEqual(p(0, 2))).toBe(true);
    });

    it("clamps column when moving down to a shorter line", () => {
      const editor = makeEditor("hello world\nhi", p(0, 10));
      editor.execute({ type: "move_cursor", direction: "down" });
      expect(editor.getCursor().active.isEqual(p(1, 2))).toBe(true);
    });

    it("up on line 0 is a no-op", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "up" });
      expect(editor.getCursor().active.isEqual(p(0, 3))).toBe(true);
    });

    it("down on last line is a no-op", () => {
      const editor = makeEditor("hello\nworld", p(1, 3));
      editor.execute({ type: "move_cursor", direction: "down" });
      expect(editor.getCursor().active.isEqual(p(1, 3))).toBe(true);
    });

    it("up collapses a selection (to end of selection range)", () => {
      const editor = makeEditor("hello\nworld", p(1, 3), p(0, 0));
      editor.execute({ type: "move_cursor", direction: "up" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
    });

    it("down collapses a selection (to end of selection range)", () => {
      const editor = makeEditor("hello\nworld", p(0, 0), p(1, 3));
      editor.execute({ type: "move_cursor", direction: "down" });
      expect(editor.getCursor().isCollapsed()).toBe(true);
    });

    it("extends selection up", () => {
      const editor = makeEditor("hello\nworld", p(1, 3));
      editor.execute({ type: "move_cursor", direction: "up", select: true });
      expect(editor.getCursor().isCollapsed()).toBe(false);
      expect(editor.getCursor().active.isEqual(p(0, 3))).toBe(true);
      expect(editor.getCursor().anchor.isEqual(p(1, 3))).toBe(true);
    });

    it("extends selection down", () => {
      const editor = makeEditor("hello\nworld", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "down", select: true });
      expect(editor.getCursor().isCollapsed()).toBe(false);
      expect(editor.getCursor().active.isEqual(p(1, 3))).toBe(true);
      expect(editor.getCursor().anchor.isEqual(p(0, 3))).toBe(true);
    });
  });

  describe("move_cursor document & line bounds", () => {
    it("moves to line start", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "lineStart" });
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("moves to line end", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "lineEnd" });
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
    });

    it("extends selection to line end", () => {
      const editor = makeEditor("hello", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "lineEnd", select: true });
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
      expect(editor.getCursor().anchor.isEqual(p(0, 3))).toBe(true);
    });

    it("moves to document start", () => {
      const editor = makeEditor("hello\nworld", p(1, 3));
      editor.execute({ type: "move_cursor", direction: "documentStart" });
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });

    it("moves to document end", () => {
      const editor = makeEditor("hello\nworld", p(0, 3));
      editor.execute({ type: "move_cursor", direction: "documentEnd" });
      expect(editor.getCursor().active.isEqual(p(1, 5))).toBe(true);
    });
  });

  describe("move_cursor_to", () => {
    it("places a collapsed cursor at the given position", () => {
      const editor = makeEditor("hello\nworld", p(0, 0));
      editor.execute({ type: "move_cursor_to", position: p(1, 3) });
      expect(editor.getCursor().active.isEqual(p(1, 3))).toBe(true);
      expect(editor.getCursor().isCollapsed()).toBe(true);
    });
  });

  describe("select_to", () => {
    it("moves active while keeping anchor (forward selection)", () => {
      const editor = makeEditor("hello world", p(0, 0));
      editor.execute({ type: "select_to", position: p(0, 5) });
      expect(editor.getCursor().anchor.isEqual(p(0, 0))).toBe(true);
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
      expect(editor.getCursor().isCollapsed()).toBe(false);
    });

    it("can create a backward selection", () => {
      const editor = makeEditor("hello world", p(0, 5));
      editor.execute({ type: "select_to", position: p(0, 0) });
      expect(editor.getCursor().anchor.isEqual(p(0, 5))).toBe(true);
      expect(editor.getCursor().active.isEqual(p(0, 0))).toBe(true);
    });
  });

  describe("select_all", () => {
    it("selects the entire document", () => {
      const editor = makeEditor("hello\nworld", p(0, 0));
      editor.execute({ type: "select_all" });
      expect(editor.getCursor().anchor.isEqual(p(0, 0))).toBe(true);
      expect(editor.getCursor().active.isEqual(p(1, 5))).toBe(true);
    });
  });

  describe("subscribe", () => {
    it("notifies listener after every execute", () => {
      const editor = makeEditor("hello", p(0, 0));
      const listener = vi.fn();
      editor.subscribe(listener);
      editor.execute({ type: "insert_text", text: "A" });
      editor.execute({ type: "insert_text", text: "B" });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("returned unsubscribe stops notifications", () => {
      const editor = makeEditor("hello", p(0, 0));
      const listener = vi.fn();
      const unsubscribe = editor.subscribe(listener);
      editor.execute({ type: "insert_text", text: "A" });
      unsubscribe();
      editor.execute({ type: "insert_text", text: "B" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("supports multiple independent listeners", () => {
      const editor = makeEditor("hello", p(0, 0));
      const a = vi.fn();
      const b = vi.fn();
      editor.subscribe(a);
      editor.subscribe(b);
      editor.execute({ type: "insert_text", text: "X" });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it("unsubscribing one listener does not affect others", () => {
      const editor = makeEditor("hello", p(0, 0));
      const a = vi.fn();
      const b = vi.fn();
      const unsubA = editor.subscribe(a);
      editor.subscribe(b);
      unsubA();
      editor.execute({ type: "insert_text", text: "X" });
      expect(a).toHaveBeenCalledTimes(0);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  describe("undo and redo", () => {
    it("undoes and redoes single text insertion", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "insert_text", text: " world" });
      expect(editor.getLineContent(0)).toBe("hello world");
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("hello");
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
      editor.execute({ type: "redo" });
      expect(editor.getLineContent(0)).toBe("hello world");
    });

    it("undoes and redoes deletion", () => {
      const editor = makeEditor("hello", p(0, 5));
      editor.execute({ type: "delete_backward" });
      expect(editor.getLineContent(0)).toBe("hell");
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("hello");
      expect(editor.getCursor().active.isEqual(p(0, 5))).toBe(true);
      editor.execute({ type: "redo" });
      expect(editor.getLineContent(0)).toBe("hell");
    });

    it("coalesces consecutive character insertions", () => {
      const editor = makeEditor("h", p(0, 1));
      editor.execute({ type: "insert_text", text: "e" });
      editor.execute({ type: "insert_text", text: "l" });
      editor.execute({ type: "insert_text", text: "l" });
      editor.execute({ type: "insert_text", text: "o" });
      expect(editor.getLineContent(0)).toBe("hello");
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("h"); // Should undo "ello" in one step
      editor.execute({ type: "redo" });
      expect(editor.getLineContent(0)).toBe("hello");
    });

    it("does not coalesce space or newline insertions into words", () => {
      const editor = makeEditor("h", p(0, 1));
      editor.execute({ type: "insert_text", text: "i" });
      editor.execute({ type: "insert_text", text: " " });
      editor.execute({ type: "insert_text", text: "t" });
      editor.execute({ type: "insert_text", text: "h" });
      editor.execute({ type: "insert_text", text: "e" });
      editor.execute({ type: "insert_text", text: "r" });
      editor.execute({ type: "insert_text", text: "e" });
      expect(editor.getLineContent(0)).toBe("hi there");
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("hi "); // Undoes "there"
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("hi"); // Undoes " "
      editor.execute({ type: "undo" });
      expect(editor.getLineContent(0)).toBe("h"); // Undoes "i"
    });
  });
});