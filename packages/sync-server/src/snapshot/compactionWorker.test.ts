/**
 * Unit tests for compactionWorker.
 *
 * All Redis I/O and api-server HTTP calls are mocked so tests run without
 * live infrastructure.
 *
 * NOTE: vi.mock factories are hoisted to the top of the file by Vitest's
 * transformer, so they must not reference variables declared in the module
 * scope. Mock functions are created inside the factory and accessed via
 * vi.mocked() after import.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing compactionWorker.
// All factories are self-contained — no outer variable references.
// ---------------------------------------------------------------------------

vi.mock("../redis.js", () => ({
  readDeltasFromStream: vi.fn(),
  trimStream: vi.fn().mockResolvedValue(undefined),
  deletePresenceKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../api/snapshotClient.js", () => ({
  fetchSnapshot: vi.fn(),
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./deltaScheduler.js", () => ({
  getOnSaved: vi.fn(),
}));

import {
  readDeltasFromStream,
  trimStream,
  deletePresenceKey,
} from "../redis.js";
import { fetchSnapshot, saveSnapshot } from "../api/snapshotClient.js";
import { getOnSaved } from "./deltaScheduler.js";
import { compactRoom, triggerImmediateCompaction } from "./compactionWorker.js";

// Typed mock references.
const mockReadDeltas = vi.mocked(readDeltasFromStream);
const mockTrimStream = vi.mocked(trimStream);
const mockDeletePresenceKey = vi.mocked(deletePresenceKey);
const mockFetchSnapshot = vi.mocked(fetchSnapshot);
const mockSaveSnapshot = vi.mocked(saveSnapshot);
const mockGetOnSaved = vi.mocked(getOnSaved);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encodes a full Yjs state update for a doc that inserts `text` into root. */
function makeYjsDelta(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("root").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

/** Reads the text content from a Yjs snapshot for assertion. */
function readText(snapshot: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, snapshot);
  return doc.getText("root").toString();
}

describe("compactionWorker — compactRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips compaction when the Redis Stream is empty", async () => {
    mockReadDeltas.mockResolvedValue([]);

    await compactRoom("room-empty");

    expect(mockFetchSnapshot).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    expect(mockTrimStream).not.toHaveBeenCalled();
  });

  it("merges deltas with no base snapshot (new room)", async () => {
    const delta = makeYjsDelta("hello");
    mockReadDeltas.mockResolvedValue([delta]);
    mockFetchSnapshot.mockResolvedValue(null); // no existing snapshot
    mockGetOnSaved.mockReturnValue(null);

    await compactRoom("room-new");

    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
    const [calledRoomId, savedData] = mockSaveSnapshot.mock.calls[0] as [string, Uint8Array];
    expect(calledRoomId).toBe("room-new");
    expect(readText(savedData)).toBe("hello");

    expect(mockTrimStream).toHaveBeenCalledWith("room-new");
  });

  it("merges deltas on top of an existing base snapshot", async () => {
    // Base snapshot: "hello"
    const baseDoc = new Y.Doc();
    baseDoc.getText("root").insert(0, "hello");
    const baseSnapshot = Y.encodeStateAsUpdate(baseDoc);

    // Delta: " world" appended (incremental update on top of base)
    const deltaDoc = new Y.Doc();
    Y.applyUpdate(deltaDoc, baseSnapshot);
    deltaDoc.getText("root").insert(5, " world");
    const delta = Y.encodeStateAsUpdate(deltaDoc, Y.encodeStateVector(baseDoc));

    mockReadDeltas.mockResolvedValue([delta]);
    mockFetchSnapshot.mockResolvedValue(baseSnapshot);
    mockGetOnSaved.mockReturnValue(null);

    await compactRoom("room-with-base");

    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
    const [, savedData] = mockSaveSnapshot.mock.calls[0] as [string, Uint8Array];
    expect(readText(savedData)).toBe("hello world");
  });

  it("applies multiple deltas in insertion order", async () => {
    const delta1 = makeYjsDelta("a");

    // Delta 2 builds on delta1
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, delta1);
    doc2.getText("root").insert(1, "b");
    const delta2 = Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(new Y.Doc()));

    mockReadDeltas.mockResolvedValue([delta1, delta2]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(null);

    await compactRoom("room-multi-delta");

    const [, savedData] = mockSaveSnapshot.mock.calls[0] as [string, Uint8Array];
    const content = readText(savedData);
    expect(content).toContain("a");
    expect(content).toContain("b");
  });

  it("trims the stream after a successful save", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("trim-me")]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(null);

    await compactRoom("room-trim");

    expect(mockTrimStream).toHaveBeenCalledWith("room-trim");
  });

  it("invokes the onSaved callback with the roomId and a timestamp", async () => {
    const onSaved = vi.fn();
    mockReadDeltas.mockResolvedValue([makeYjsDelta("saved")]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(onSaved);

    const before = Date.now();
    await compactRoom("room-onsaved");
    const after = Date.now();

    expect(onSaved).toHaveBeenCalledOnce();
    const [callRoomId, timestamp] = onSaved.mock.calls[0] as [string, number];
    expect(callRoomId).toBe("room-onsaved");
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("does not invoke onSaved when no callback is registered", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("no-cb")]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(null);

    await expect(compactRoom("room-no-cb")).resolves.toBeUndefined();
  });

  it("skips empty delta buffers (zero-length Uint8Arrays) without crashing", async () => {
    const validDelta = makeYjsDelta("valid");
    const emptyDelta = new Uint8Array(0);

    mockReadDeltas.mockResolvedValue([emptyDelta, validDelta, emptyDelta]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(null);

    await expect(compactRoom("room-empty-deltas")).resolves.toBeUndefined();
    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
  });
});

describe("compactionWorker — triggerImmediateCompaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs compaction and then deletes the presence key", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("final")]);
    mockFetchSnapshot.mockResolvedValue(null);
    mockGetOnSaved.mockReturnValue(null);

    await triggerImmediateCompaction("room-teardown");

    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
    expect(mockTrimStream).toHaveBeenCalledWith("room-teardown");
    expect(mockDeletePresenceKey).toHaveBeenCalledWith("room-teardown");
  });

  it("still deletes the presence key even when the stream is empty", async () => {
    mockReadDeltas.mockResolvedValue([]); // nothing to compact

    await triggerImmediateCompaction("room-teardown-empty");

    // No save/trim since stream was empty.
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    // But presence key must always be cleaned up.
    expect(mockDeletePresenceKey).toHaveBeenCalledWith("room-teardown-empty");
  });
});
