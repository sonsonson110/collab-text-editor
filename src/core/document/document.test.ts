import { describe, it, expect } from "vitest";
import { Document } from "./document";
import { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(text: string) {
  return new Document(text);
}

// ---------------------------------------------------------------------------
// getText / getLength / getLineCount
// ---------------------------------------------------------------------------

describe("Document", () => {
  describe("initial state", () => {
    it("getText returns the initial text", () => {
      const doc = makeDoc("hello");
      expect(doc.getText()).toBe("hello");
    });

    it("getLength returns character count", () => {
      const doc = makeDoc("hello");
      expect(doc.getLength()).toBe(5);
    });

    it("empty document has length 0 and one line", () => {
      const doc = makeDoc("");
      expect(doc.getLength()).toBe(0);
      expect(doc.getLineCount()).toBe(1);
    });

    it("getLineCount reflects newline count + 1", () => {
      const doc = makeDoc("a\nb\nc");
      expect(doc.getLineCount()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe("insert", () => {
    it("inserts text at the beginning", () => {
      const doc = makeDoc("world");
      doc.insert(new Position(0, 0), "hello ");
      expect(doc.getText()).toBe("hello world");
    });

    it("inserts text in the middle of a line", () => {
      const doc = makeDoc("helo");
      doc.insert(new Position(0, 3), "l");
      expect(doc.getText()).toBe("hello");
    });

    it("inserts text at the end", () => {
      const doc = makeDoc("hello");
      doc.insert(new Position(0, 5), " world");
      expect(doc.getText()).toBe("hello world");
    });

    it("inserting a newline increases line count by one", () => {
      const doc = makeDoc("hello world");
      doc.insert(new Position(0, 5), "\n");
      expect(doc.getLineCount()).toBe(2);
      expect(doc.getText()).toBe("hello\n world");
    });

    it("inserts on a second line correctly", () => {
      const doc = makeDoc("line1\nline2");
      doc.insert(new Position(1, 5), "X");
      expect(doc.getText()).toBe("line1\nline2X");
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe("delete", () => {
    it("deletes a single character", () => {
      const doc = makeDoc("hello");
      doc.delete(new Range(new Position(0, 1), new Position(0, 2)));
      expect(doc.getText()).toBe("hllo");
    });

    it("deletes a range spanning multiple characters", () => {
      const doc = makeDoc("hello world");
      doc.delete(new Range(new Position(0, 5), new Position(0, 11)));
      expect(doc.getText()).toBe("hello");
    });

    it("deleting a newline merges two lines", () => {
      const doc = makeDoc("line1\nline2");
      // newline is at offset 5, position (0, 5)
      doc.delete(new Range(new Position(0, 5), new Position(0, 6)));
      expect(doc.getText()).toBe("line1line2");
      expect(doc.getLineCount()).toBe(1);
    });

    it("deleting an empty range is a no-op", () => {
      const doc = makeDoc("hello");
      const pos = new Position(0, 2);
      doc.delete(new Range(pos, pos));
      expect(doc.getText()).toBe("hello");
    });

    it("accepts a reversed range and normalises it", () => {
      const doc = makeDoc("hello");
      // Range constructor normalises, so passing reversed is safe
      doc.delete(new Range(new Position(0, 3), new Position(0, 1)));
      expect(doc.getText()).toBe("hlo");
    });
  });

  // -------------------------------------------------------------------------
  // replace
  // -------------------------------------------------------------------------

  describe("replace", () => {
    it("replaces a selection with new text of same length", () => {
      const doc = makeDoc("hello world");
      doc.replace(new Range(new Position(0, 6), new Position(0, 11)), "earth");
      expect(doc.getText()).toBe("hello earth");
    });

    it("replace with empty string acts as delete", () => {
      const doc = makeDoc("hello world");
      doc.replace(new Range(new Position(0, 5), new Position(0, 11)), "");
      expect(doc.getText()).toBe("hello");
    });

    it("replace on empty range acts as insert", () => {
      const doc = makeDoc("helo");
      const pos = new Position(0, 3);
      doc.replace(new Range(pos, pos), "l");
      expect(doc.getText()).toBe("hello");
    });

    it("replace across lines updates line count", () => {
      const doc = makeDoc("line1\nline2\nline3");
      // replace from end of line1 to start of line3 with a single word
      doc.replace(new Range(new Position(0, 5), new Position(2, 0)), " and ");
      expect(doc.getText()).toBe("line1 and line3");
      expect(doc.getLineCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getLineContent
  // -------------------------------------------------------------------------

  describe("getLineContent", () => {
    it("returns the content of line 0 without trailing newline", () => {
      const doc = makeDoc("hello\nworld");
      expect(doc.getLineContent(0)).toBe("hello");
    });

    it("returns the content of line 1", () => {
      const doc = makeDoc("hello\nworld");
      expect(doc.getLineContent(1)).toBe("world");
    });

    it("returns empty string for an empty line", () => {
      const doc = makeDoc("hello\n\nworld");
      expect(doc.getLineContent(1)).toBe("");
    });

    it("returns empty string for an empty document", () => {
      const doc = makeDoc("");
      expect(doc.getLineContent(0)).toBe("");
    });

    it("does not include the newline character in content", () => {
      const doc = makeDoc("abc\ndef");
      const content = doc.getLineContent(0);
      expect(content.includes("\n")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getLineLength
  // -------------------------------------------------------------------------

  describe("getLineLength", () => {
    it("returns length of first line excluding newline", () => {
      const doc = makeDoc("hello\nworld");
      // 'hello' has 5 chars, newline excluded
      expect(doc.getLineLength(0)).toBe(5);
    });

    it("returns length of last line (no newline to exclude)", () => {
      const doc = makeDoc("hello\nworld");
      // 'world' has 5 chars
      expect(doc.getLineLength(1)).toBe(5);
    });

    it("returns 0 for an empty line between two lines", () => {
      const doc = makeDoc("a\n\nb");
      expect(doc.getLineLength(1)).toBe(0);
    });

    it("returns 0 for an empty document", () => {
      const doc = makeDoc("");
      expect(doc.getLineLength(0)).toBe(0);
    });

    it("length matches getLineContent length for all lines", () => {
      const doc = makeDoc("first line\nsecond line\nthird");
      for (let i = 0; i < doc.getLineCount(); i++) {
        expect(doc.getLineLength(i)).toBe(doc.getLineContent(i).length);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getTextInRange
  // -------------------------------------------------------------------------

  describe("getTextInRange", () => {
    it("returns text within a single line", () => {
      const doc = makeDoc("hello world");
      const range = new Range(new Position(0, 6), new Position(0, 11));
      expect(doc.getTextInRange(range)).toBe("world");
    });

    it("returns empty string for an empty range", () => {
      const doc = makeDoc("hello");
      const pos = new Position(0, 2);
      expect(doc.getTextInRange(new Range(pos, pos))).toBe("");
    });

    it("includes newline when range spans across lines", () => {
      const doc = makeDoc("hello\nworld");
      const range = new Range(new Position(0, 5), new Position(1, 0));
      expect(doc.getTextInRange(range)).toBe("\n");
    });

    it("returns full multi-line text when range spans lines", () => {
      const doc = makeDoc("abc\ndefg");
      const range = new Range(new Position(0, 1), new Position(1, 3));
      expect(doc.getTextInRange(range)).toBe("bc\ndef");
    });
  });

  // -------------------------------------------------------------------------
  // getOffsetAt / getPositionAt
  // -------------------------------------------------------------------------

  describe("getOffsetAt / getPositionAt", () => {
    it("offset 0 corresponds to position (0, 0)", () => {
      const doc = makeDoc("hello\nworld");
      expect(doc.getOffsetAt(new Position(0, 0))).toBe(0);
      const pos = doc.getPositionAt(0);
      expect(pos.line).toBe(0);
      expect(pos.column).toBe(0);
    });

    it("round-trips position → offset → position on line 0", () => {
      const doc = makeDoc("hello\nworld");
      const original = new Position(0, 3);
      const offset = doc.getOffsetAt(original);
      const back = doc.getPositionAt(offset);
      expect(back.line).toBe(original.line);
      expect(back.column).toBe(original.column);
    });

    it("round-trips position → offset → position on line 1", () => {
      const doc = makeDoc("hello\nworld");
      const original = new Position(1, 2);
      const offset = doc.getOffsetAt(original);
      const back = doc.getPositionAt(offset);
      expect(back.line).toBe(original.line);
      expect(back.column).toBe(original.column);
    });

    it("offset of position (1, 0) is one past the newline", () => {
      const doc = makeDoc("hello\nworld");
      // 'hello' = 5 chars, '\n' at 5, line 1 starts at 6
      expect(doc.getOffsetAt(new Position(1, 0))).toBe(6);
    });
  });

  // -------------------------------------------------------------------------
  // line index integrity after mutations
  // -------------------------------------------------------------------------

  describe("line index stays consistent after edits", () => {
    it("inserting a newline makes getLineContent correct on both new lines", () => {
      const doc = makeDoc("helloworld");
      doc.insert(new Position(0, 5), "\n");
      expect(doc.getLineContent(0)).toBe("hello");
      expect(doc.getLineContent(1)).toBe("world");
    });

    it("deleting a newline merges lines and getLineContent is correct", () => {
      const doc = makeDoc("hello\nworld");
      doc.delete(new Range(new Position(0, 5), new Position(1, 0)));
      expect(doc.getLineCount()).toBe(1);
      expect(doc.getLineContent(0)).toBe("helloworld");
    });

    it("sequential inserts keep line content accurate", () => {
      const doc = makeDoc("");
      doc.insert(new Position(0, 0), "line0");
      doc.insert(new Position(0, 5), "\n");
      doc.insert(new Position(1, 0), "line1");
      expect(doc.getLineContent(0)).toBe("line0");
      expect(doc.getLineContent(1)).toBe("line1");
    });
  });
});
