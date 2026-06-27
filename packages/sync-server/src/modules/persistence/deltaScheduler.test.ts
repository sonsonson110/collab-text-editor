import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createEventBus } from "../../infra";
import { createDeltaScheduler } from "./deltaScheduler";

vi.mock("./streamHelpers.js", () => ({
  appendDeltaToStream: vi.fn().mockResolvedValue(undefined),
}));

import { appendDeltaToStream } from "./streamHelpers";

const mockAppend = appendDeltaToStream as ReturnType<typeof vi.fn>;

describe("deltaScheduler", () => {
  let bus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    bus = createEventBus();
    createDeltaScheduler(bus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes buffered deltas to the stream after 1 second", async () => {
    bus.emit("ROOM_READY", { roomId: "room-1" });
    bus.emit("DOC_UPDATED", {
      roomId: "room-1",
      update: new Uint8Array([1, 2, 3]),
      origin: {} as WebSocket,
    });

    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockAppend).toHaveBeenCalledOnce();
  });

  it("flushes remaining buffered deltas immediately on ROOM_TEARDOWN", async () => {
    bus.emit("ROOM_READY", { roomId: "room-1" });
    bus.emit("DOC_UPDATED", {
      roomId: "room-1",
      update: new Uint8Array([1, 2, 3]),
      origin: {} as WebSocket,
    });

    expect(mockAppend).not.toHaveBeenCalled();

    bus.emit("ROOM_TEARDOWN", { roomId: "room-1" });
    await Promise.resolve();

    expect(mockAppend).toHaveBeenCalledOnce();
  });

  it("broadcasts SNAPSHOT_SAVED message to clients", () => {
    bus.emit("ROOM_READY", { roomId: "room-1" });

    let broadcastReceived = false;
    bus.on("OUTBOUND_WS_BROADCAST", () => {
      broadcastReceived = true;
    });

    bus.emit("SNAPSHOT_SAVED", { roomId: "room-1", timestamp: 123456789 });

    expect(broadcastReceived).toBe(true);
  });
});
