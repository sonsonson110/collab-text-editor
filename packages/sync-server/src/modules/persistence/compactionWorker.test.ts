import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";
import { createEventBus } from "../../infra";

vi.mock("./streamHelpers.js", () => ({
  readDeltasFromStream: vi.fn(),
  trimStream: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../room/presenceHelpers.js", () => ({
  deletePresenceKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./snapshotHydrator.js", () => ({
  fetchSnapshot: vi.fn(),
}));

vi.mock("./snapshotPersister.js", () => ({
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
}));

import { readDeltasFromStream, trimStream } from "./streamHelpers";
import { deletePresenceKey } from "../room";
import { fetchSnapshot } from "./snapshotHydrator";
import { saveSnapshot } from "./snapshotPersister";
import { compactRoom, triggerImmediateCompaction } from "./compactionWorker";

const mockReadDeltas = vi.mocked(readDeltasFromStream);
const mockTrimStream = vi.mocked(trimStream);
const mockDeletePresenceKey = vi.mocked(deletePresenceKey);
const mockFetchSnapshot = vi.mocked(fetchSnapshot);
const mockSaveSnapshot = vi.mocked(saveSnapshot);

function makeYjsDelta(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("root").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

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
  });

  it("merges deltas with no base snapshot (new room)", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("hello")]);
    mockFetchSnapshot.mockResolvedValue(null);

    await compactRoom("room-new");

    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
    const [calledRoomId, savedData] = mockSaveSnapshot.mock.calls[0] as [
      string,
      Uint8Array,
    ];
    expect(calledRoomId).toBe("room-new");
    expect(readText(savedData)).toBe("hello");
    expect(mockTrimStream).toHaveBeenCalledWith("room-new");
  });

  it("emits SNAPSHOT_SAVED when a bus is provided", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("hello")]);
    mockFetchSnapshot.mockResolvedValue(null);

    const bus = createEventBus();
    let emitted = false;
    bus.on("SNAPSHOT_SAVED", () => {
      emitted = true;
    });

    await compactRoom("room-event", bus);
    expect(emitted).toBe(true);
  });
});

describe("compactionWorker — triggerImmediateCompaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs compaction and then deletes the presence key", async () => {
    mockReadDeltas.mockResolvedValue([makeYjsDelta("final")]);
    mockFetchSnapshot.mockResolvedValue(null);

    await triggerImmediateCompaction("room-teardown");

    expect(mockSaveSnapshot).toHaveBeenCalledOnce();
    expect(mockTrimStream).toHaveBeenCalledWith("room-teardown");
    expect(mockDeletePresenceKey).toHaveBeenCalledWith("room-teardown");
  });
});
