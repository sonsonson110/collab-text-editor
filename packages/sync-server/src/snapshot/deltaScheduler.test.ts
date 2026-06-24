/**
 * Unit tests for deltaScheduler.
 *
 * All Redis I/O is mocked so the tests run without a live Redis instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Mock the redis module BEFORE importing deltaScheduler so the scheduler
// sees the mock when it initialises its setInterval.
// ---------------------------------------------------------------------------
vi.mock("../redis.js", () => ({
  appendDeltaToStream: vi.fn().mockResolvedValue(undefined),
  REDIS_KEY_ROOM_UPDATES_PREFIX: "room:updates:",
}));

import { appendDeltaToStream } from "../redis.js";
import {
  startTracking,
  stopTracking,
  getOnSaved,
} from "./deltaScheduler.js";

// Cast the mock so TypeScript is happy in the test file.
const mockAppend = appendDeltaToStream as ReturnType<typeof vi.fn>;

describe("deltaScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── startTracking / getOnSaved ────────────────────────────────────────────

  it("registers the onSaved callback and returns it via getOnSaved", () => {
    const doc = new Y.Doc();
    const onSaved = vi.fn();
    startTracking("room-1", doc, onSaved);

    expect(getOnSaved("room-1")).toBe(onSaved);

    void stopTracking("room-1", doc);
    doc.destroy();
  });

  it("returns null from getOnSaved when no callback was registered", () => {
    const doc = new Y.Doc();
    startTracking("room-cb-null", doc);

    expect(getOnSaved("room-cb-null")).toBeNull();

    void stopTracking("room-cb-null", doc);
    doc.destroy();
  });

  it("returns null from getOnSaved for an untracked room", () => {
    expect(getOnSaved("non-existent-room")).toBeNull();
  });

  it("is idempotent: calling startTracking twice does not double-register", () => {
    const doc = new Y.Doc();
    startTracking("room-idem", doc);
    startTracking("room-idem", doc); // second call should be a no-op

    // Only one listener registered — produce an update and verify appendDeltaToStream
    // is called once per flush, not twice.
    doc.getText("t").insert(0, "hello");
    vi.advanceTimersByTime(1_000);

    // appendDeltaToStream may be called once (the single pending delta).
    // If double-registered, each update would be buffered twice.
    expect(mockAppend.mock.calls.length).toBeLessThanOrEqual(1);

    void stopTracking("room-idem", doc);
    doc.destroy();
  });

  // ── Flush interval ────────────────────────────────────────────────────────

  it("does not call appendDeltaToStream before the flush interval fires", () => {
    const doc = new Y.Doc();
    startTracking("room-flush-1", doc);

    doc.getText("t").insert(0, "hello");

    // No time has passed — should NOT have flushed yet.
    expect(mockAppend).not.toHaveBeenCalled();

    void stopTracking("room-flush-1", doc);
    doc.destroy();
  });

  it("flushes buffered deltas to the stream after 1 second", async () => {
    const doc = new Y.Doc();
    startTracking("room-flush-2", doc);

    doc.getText("t").insert(0, "hello");

    vi.advanceTimersByTime(1_000);
    // Drain the async flushPendingDeltas microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockAppend).toHaveBeenCalledOnce();

    await stopTracking("room-flush-2", doc);
    doc.destroy();
  });

  it("flushes once per interval even with multiple updates in that window", async () => {
    const doc = new Y.Doc();
    startTracking("room-flush-multi", doc);

    const text = doc.getText("t");
    text.insert(0, "a");
    text.insert(1, "b");
    text.insert(2, "c");

    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    // Three updates → three XADD calls (one per delta).
    expect(mockAppend).toHaveBeenCalledTimes(3);

    await stopTracking("room-flush-multi", doc);
    doc.destroy();
  });

  it("does not flush if there are no pending deltas", async () => {
    const doc = new Y.Doc();
    startTracking("room-flush-empty", doc);

    // No edits — the buffer is empty.
    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockAppend).not.toHaveBeenCalled();

    await stopTracking("room-flush-empty", doc);
    doc.destroy();
  });

  // ── stopTracking ──────────────────────────────────────────────────────────

  it("flushes remaining buffered deltas immediately on stopTracking", async () => {
    const doc = new Y.Doc();
    startTracking("room-stop-1", doc);

    // Edit without advancing timers so the interval hasn't fired.
    doc.getText("t").insert(0, "flush-on-stop");

    expect(mockAppend).not.toHaveBeenCalled();

    await stopTracking("room-stop-1", doc);

    // stopTracking must have flushed immediately.
    expect(mockAppend).toHaveBeenCalledOnce();

    doc.destroy();
  });

  it("removes the update listener on stopTracking so further edits are not buffered", async () => {
    const doc = new Y.Doc();
    startTracking("room-stop-2", doc);

    await stopTracking("room-stop-2", doc);

    // After stopping, edits should not queue new deltas.
    doc.getText("t").insert(0, "post-stop");

    vi.advanceTimersByTime(2_000);
    await vi.runAllTimersAsync();

    // appendDeltaToStream should still only have been called 0 times
    // (no deltas were pending at stop time, and the listener was removed).
    expect(mockAppend).not.toHaveBeenCalled();

    doc.destroy();
  });

  it("is safe to call stopTracking on an untracked room", async () => {
    const doc = new Y.Doc();
    // Should not throw.
    await expect(stopTracking("never-tracked", doc)).resolves.toBeUndefined();
    doc.destroy();
  });
});
