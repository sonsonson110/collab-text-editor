import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { CollaborativeDocument } from "@/core/document/collaborativeDocument";
import { Position } from "@/core/position/position";
import { Range } from "@/core/position/range";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(initialText = ""): {
  ydoc: Y.Doc;
  collab: CollaborativeDocument;
} {
  const ydoc = new Y.Doc();
  const yText = ydoc.getText("content");
  if (initialText) {
    yText.insert(0, initialText);
  }
  return { ydoc, collab: new CollaborativeDocument(yText) };
}

function pos(line: number, column: number): Position {
  return new Position(line, column);
}

function range(
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): Range {
  return new Range(pos(startLine, startCol), pos(endLine, endCol));
}

// ---------------------------------------------------------------------------
// Suite A — Single-document mutations
// ---------------------------------------------------------------------------

describe("CollaborativeDocument — single-document mutations", () => {
  it("starts with the correct initial text", () => {
    const { collab } = makeDoc("Hello World");
    expect(collab.getText()).toBe("Hello World");
    expect(collab.getLength()).toBe(11);
  });

  it("insert at start", () => {
    const { collab } = makeDoc("World");
    collab.insert(pos(0, 0), "Hello ");
    expect(collab.getText()).toBe("Hello World");
  });

  it("insert in the middle", () => {
    const { collab } = makeDoc("Helo");
    collab.insert(pos(0, 3), "l");
    expect(collab.getText()).toBe("Hello");
  });

  it("insert at end", () => {
    const { collab } = makeDoc("Hello");
    collab.insert(pos(0, 5), "!");
    expect(collab.getText()).toBe("Hello!");
  });

  it("delete a range", () => {
    const { collab } = makeDoc("Hello World");
    collab.delete(range(0, 5, 0, 11));
    expect(collab.getText()).toBe("Hello");
  });

  it("replace a range", () => {
    const { collab } = makeDoc("Hello World");
    collab.replace(range(0, 6, 0, 11), "Yjs");
    expect(collab.getText()).toBe("Hello Yjs");
  });

  it("replace with empty string acts like delete", () => {
    const { collab } = makeDoc("Hello World");
    collab.replace(range(0, 5, 0, 11), "");
    expect(collab.getText()).toBe("Hello");
  });

  it("getLineCount is correct for multi-line text", () => {
    const { collab } = makeDoc("line1\nline2\nline3");
    expect(collab.getLineCount()).toBe(3);
  });

  it("getLineContent returns the correct line without newline", () => {
    const { collab } = makeDoc("line1\nline2\nline3");
    expect(collab.getLineContent(0)).toBe("line1");
    expect(collab.getLineContent(1)).toBe("line2");
    expect(collab.getLineContent(2)).toBe("line3");
  });

  it("getLineLength returns correct length excluding newline", () => {
    const { collab } = makeDoc("abc\nde\nf");
    expect(collab.getLineLength(0)).toBe(3);
    expect(collab.getLineLength(1)).toBe(2);
    expect(collab.getLineLength(2)).toBe(1);
  });

  it("getMaxLineLength returns the longest line length", () => {
    const { collab } = makeDoc("short\nthis is longer\nmed");
    expect(collab.getMaxLineLength()).toBe(14); // "this is longer"
  });

  it("getTextInRange returns correct substring", () => {
    const { collab } = makeDoc("Hello World");
    const text = collab.getTextInRange(range(0, 6, 0, 11));
    expect(text).toBe("World");
  });

  it("getOffsetAt / getPositionAt round-trip", () => {
    const { collab } = makeDoc("Hello\nWorld");
    const p = pos(1, 3);
    const offset = collab.getOffsetAt(p);
    expect(collab.getPositionAt(offset)).toEqual(p);
  });

  it("lineIndex updates after insert", () => {
    const { collab } = makeDoc("Hello");
    collab.insert(pos(0, 5), "\nWorld");
    expect(collab.getLineCount()).toBe(2);
    expect(collab.getLineContent(1)).toBe("World");
  });
});

// ---------------------------------------------------------------------------
// Suite B — In-memory two-doc CRDT sync
// ---------------------------------------------------------------------------

describe("CollaborativeDocument — in-memory CRDT sync", () => {
  function makeSyncedPair(initialText = ""): {
    collab1: CollaborativeDocument;
    collab2: CollaborativeDocument;
    ydoc1: Y.Doc;
    ydoc2: Y.Doc;
  } {
    const ydoc1 = new Y.Doc();
    const ydoc2 = new Y.Doc();

    // Bidirectional in-memory sync
    ydoc1.on("update", (update: Uint8Array) => Y.applyUpdate(ydoc2, update));
    ydoc2.on("update", (update: Uint8Array) => Y.applyUpdate(ydoc1, update));

    const yText1 = ydoc1.getText("content");
    const yText2 = ydoc2.getText("content");

    if (initialText) {
      // Insert only via doc1; sync propagates to doc2
      yText1.insert(0, initialText);
    }

    return {
      collab1: new CollaborativeDocument(yText1),
      collab2: new CollaborativeDocument(yText2),
      ydoc1,
      ydoc2,
    };
  }

  it("mutation on doc1 propagates to doc2", () => {
    const { collab1, collab2 } = makeSyncedPair();
    collab1.insert(pos(0, 0), "Hello");
    expect(collab2.getText()).toBe("Hello");
  });

  it("mutation on doc2 propagates to doc1", () => {
    const { collab1, collab2 } = makeSyncedPair("Hello");
    collab2.insert(pos(0, 5), " World");
    expect(collab1.getText()).toBe("Hello World");
  });

  it("concurrent insertions converge to the same text on both peers", () => {
    const { collab1, collab2 } = makeSyncedPair("XZ");
    // Both peers insert at the same logical position concurrently.
    // In a real disconnected scenario this requires offline; here sync is
    // synchronous so we verify convergence (both see the same final text).
    collab1.insert(pos(0, 1), "A");
    collab2.insert(pos(0, 1), "B");
    // Both documents must have identical content (CRDT convergence guarantee)
    expect(collab1.getText()).toBe(collab2.getText());
    // Both characters must be present
    expect(collab1.getText()).toContain("A");
    expect(collab1.getText()).toContain("B");
  });

  it("delete on doc1 removes content on doc2", () => {
    const { collab1, collab2 } = makeSyncedPair("Hello World");
    collab1.delete(range(0, 5, 0, 11));
    expect(collab2.getText()).toBe("Hello");
  });

  it("lineIndex on both peers stays accurate after sync", () => {
    const { collab1, collab2 } = makeSyncedPair("Hello");
    collab1.insert(pos(0, 5), "\nWorld");
    expect(collab2.getLineCount()).toBe(2);
    expect(collab2.getLineContent(1)).toBe("World");
  });
});

// ---------------------------------------------------------------------------
// Suite C — Remote-change notification (subscribe)
// ---------------------------------------------------------------------------

describe("CollaborativeDocument — subscribe / notification", () => {
  function makeSyncedPair(): {
    collab1: CollaborativeDocument;
    collab2: CollaborativeDocument;
  } {
    const ydoc1 = new Y.Doc();
    const ydoc2 = new Y.Doc();
    ydoc1.on("update", (update: Uint8Array) => Y.applyUpdate(ydoc2, update));
    ydoc2.on("update", (update: Uint8Array) => Y.applyUpdate(ydoc1, update));
    return {
      collab1: new CollaborativeDocument(ydoc1.getText("content")),
      collab2: new CollaborativeDocument(ydoc2.getText("content")),
    };
  }

  it("subscribe listener fires when a remote peer mutates", () => {
    const { collab1, collab2 } = makeSyncedPair();
    const listener = vi.fn();
    collab1.subscribe(listener);

    // Remote mutation from doc2
    collab2.insert(pos(0, 0), "Remote");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("subscribe listener does NOT fire for local mutations", () => {
    const { collab1 } = makeSyncedPair();
    const listener = vi.fn();
    collab1.subscribe(listener);

    // Local mutation — should not trigger the external listener
    collab1.insert(pos(0, 0), "Local");
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribe stops listener from being called", () => {
    const { collab1, collab2 } = makeSyncedPair();
    const listener = vi.fn();
    const unsubscribe = collab1.subscribe(listener);
    unsubscribe();

    collab2.insert(pos(0, 0), "Remote");
    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple listeners are all notified on remote change", () => {
    const { collab1, collab2 } = makeSyncedPair();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    collab1.subscribe(listener1);
    collab1.subscribe(listener2);

    collab2.insert(pos(0, 0), "ping");
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});
