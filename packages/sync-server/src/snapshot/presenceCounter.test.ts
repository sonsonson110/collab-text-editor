/**
 * Unit tests for presenceCounter.
 *
 * Redis I/O is mocked so tests run without a live Redis instance.
 * Timer behaviour is tested with Vitest's fake timers.
 *
 * NOTE: vi.mock factories are hoisted to the top of the file by Vitest's
 * transformer, so they must not reference variables declared in the module
 * scope. Mock functions are created inside the factory and re-used via
 * vi.mocked() or by importing the mocked module members directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock redis.ts BEFORE importing presenceCounter.
// vi.mock is hoisted — factory must be self-contained (no outer variables).
// ---------------------------------------------------------------------------
vi.mock("../infra/redisClient.js", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
  NODE_ID: "test-node-id-fixed",
  REDIS_KEY_ROOM_HEARTBEAT_PREFIX: "room:heartbeat:",
}));

// Import AFTER the mock is registered.
import { redis } from "../infra";
import { startHeartbeat, stopHeartbeat } from "./presenceCounter";

// Typed mock references for assertion convenience.
const mockSet = vi.mocked(redis.set);
const mockDel = vi.mocked(redis.del);

const HEARTBEAT_KEY = "room:heartbeat:room-test:test-node-id-fixed";

describe("presenceCounter — heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the heartbeat key immediately on startHeartbeat", async () => {
    startHeartbeat("room-test");
    // Allow the microtask (redis.set) to settle.
    await Promise.resolve();

    expect(mockSet).toHaveBeenCalledWith(HEARTBEAT_KEY, "1", "EX", 60);

    stopHeartbeat("room-test");
  });

  it("refreshes the heartbeat key every 15 seconds", async () => {
    startHeartbeat("room-hb-refresh");
    await Promise.resolve();

    // Advance 15 seconds — the interval should fire once.
    vi.advanceTimersByTime(15_000);
    await Promise.resolve();

    // Initial call + 1 interval = 2 calls.
    expect(mockSet).toHaveBeenCalledTimes(2);

    // Advance another 15 seconds.
    vi.advanceTimersByTime(15_000);
    await Promise.resolve();

    expect(mockSet).toHaveBeenCalledTimes(3);

    stopHeartbeat("room-hb-refresh");
  });

  it("is idempotent: calling startHeartbeat twice does not create two intervals", async () => {
    startHeartbeat("room-idem");
    startHeartbeat("room-idem"); // second call — should be a no-op
    await Promise.resolve();

    // Only the first startHeartbeat should have set the key.
    expect(mockSet).toHaveBeenCalledTimes(1);

    stopHeartbeat("room-idem");
  });

  it("clears the interval and deletes the key on stopHeartbeat", async () => {
    startHeartbeat("room-stop");
    await Promise.resolve();

    stopHeartbeat("room-stop");
    await Promise.resolve();

    expect(mockDel).toHaveBeenCalledWith(
      "room:heartbeat:room-stop:test-node-id-fixed",
    );

    // Advance timers — the interval should no longer fire.
    const callsBefore = mockSet.mock.calls.length;
    vi.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(mockSet.mock.calls.length).toBe(callsBefore);
  });

  it("is safe to call stopHeartbeat on an unstarted room", () => {
    // Should not throw.
    expect(() => stopHeartbeat("never-started")).not.toThrow();
  });
});
