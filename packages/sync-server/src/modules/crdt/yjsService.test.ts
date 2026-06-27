import { describe, expect, it, vi, beforeEach } from "vitest";
import { createYjsService } from "./yjsService";
import { createEventBus, TypedEventEmitter } from "../../infra";
import { MSG_SYNC } from "../../types";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { WebSocket } from "ws";

describe("yjsService", () => {
  let bus: TypedEventEmitter;

  beforeEach(() => {
    bus = createEventBus();
    createYjsService(bus);
  });

  it("initializes yjs doc on ROOM_CREATED and sends SyncStep1 on CLIENT_CONNECTED", () => {
    const roomId = "room-1";
    bus.emit("ROOM_CREATED", { roomId });

    const ws = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    let outboundWs: WebSocket | undefined;
    let outboundMessage: Uint8Array | undefined;

    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs, message }) => {
      outboundWs = targetWs;
      outboundMessage = message;
    });

    bus.emit("CLIENT_CONNECTED", {
      roomId,
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "EDITOR", isMember: true },
    });

    expect(outboundWs).toBe(ws);
    expect(outboundMessage).toBeDefined();

    const decoder = decoding.createDecoder(outboundMessage!);
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(MSG_SYNC);

    const syncType = decoding.readVarUint(decoder);
    expect(syncType).toBe(0); // SyncStep1
  });

  it("successfully processes client SyncStep2 messages via PERMITTED_SYNC_MESSAGE", () => {
    const roomId = "room-2";
    bus.emit("ROOM_CREATED", { roomId });

    const ws = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    // Create a client message representing SyncStep2.
    // SyncStep2 contains the state vector of the other peer (in this case, empty).
    const doc = new Y.Doc();
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep2(encoder, doc);
    const clientMessage = encoding.toUint8Array(encoder);

    // Emit PERMITTED_SYNC_MESSAGE and ensure it does not throw
    expect(() => {
      bus.emit("PERMITTED_SYNC_MESSAGE", {
        roomId,
        ws,
        message: clientMessage,
        origin: "client",
      });
    }).not.toThrow();
  });

  it("applies raw updates directly when origin is redis", () => {
    const roomId = "room-3";
    bus.emit("ROOM_CREATED", { roomId });

    // Generate a raw Yjs update
    const sourceDoc = new Y.Doc();
    const text = sourceDoc.getText("content");
    text.insert(0, "Hello cross-node!");
    const update = Y.encodeStateAsUpdate(sourceDoc);

    // Listen for DOC_UPDATED event to verify update is applied
    let docUpdated = false;
    bus.on("DOC_UPDATED", ({ roomId: rId, origin }) => {
      if (rId === roomId && origin === "redis") {
        docUpdated = true;
      }
    });

    bus.emit("PERMITTED_SYNC_MESSAGE", {
      roomId,
      message: update,
      origin: "redis",
    });

    expect(docUpdated).toBe(true);
  });
});
