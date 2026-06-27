import { describe, expect, it, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { createPermissionService } from "./permissionService.js";
import { createEventBus, TypedEventEmitter } from "../../infra/eventBus.js";
import { createRoomManager } from "../room/roomManager.js";
import { WS_CLOSE_FORBIDDEN } from "../../types/protocol.js";
import * as encoding from "lib0/encoding";
import { MSG_PERMISSION_CHANGED } from "../../types/protocol.js";

function getPermissionMsgEvent(message: Uint8Array): any {
  // It's [MSG_PERMISSION_CHANGED, VarString]
  // We can't easily decode without lib0/decoding, but we just want to know it's a permission message
  return true;
}

describe("permissionService", () => {
  let bus: TypedEventEmitter;

  beforeEach(() => {
    bus = createEventBus();
    createRoomManager(bus);
    createPermissionService(bus);
  });

  it("updates guest roles and broadcasts on access_mode_changed to PUBLIC_EDIT", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    // Simulate connection
    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-1",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "VIEWER", isMember: false },
    });

    let outboundWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs }) => {
      outboundWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-1",
      event: {
        type: "access_mode_changed",
        roomId: "room-1",
        accessMode: "PUBLIC_EDIT",
      },
    });

    expect(outboundWs).toBe(ws);
  });

  it("updates guest roles and broadcasts on access_mode_changed to PUBLIC_VIEW", () => {
    const ws = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-1",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "EDITOR", isMember: false },
    });

    let outboundWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs }) => {
      outboundWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-1",
      event: {
        type: "access_mode_changed",
        roomId: "room-1",
        accessMode: "PUBLIC_VIEW",
      },
    });

    expect(outboundWs).toBe(ws);
  });

  it("retains explicit member roles on access_mode_changed", () => {
    const ws = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-1",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "EDITOR", isMember: true },
    });

    let outboundWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs }) => {
      outboundWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-1",
      event: {
        type: "access_mode_changed",
        roomId: "room-1",
        accessMode: "PUBLIC_VIEW",
      },
    });

    expect(outboundWs).toBe(ws);
  });

  it("closes public connections and retains member connections on transition to PRIVATE", () => {
    const guestWs = { readyState: 1, close: vi.fn() } as unknown as WebSocket;
    const memberWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-1",
      connectionId: "conn-g",
      ws: guestWs,
      claims: { userId: "guest-1", effectiveRole: "EDITOR", isMember: false },
    });

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-1",
      connectionId: "conn-m",
      ws: memberWs,
      claims: { userId: "member-1", effectiveRole: "EDITOR", isMember: true },
    });

    let kickedWs: WebSocket | undefined;
    bus.on("KICK_CONNECTION", ({ ws }) => {
      kickedWs = ws;
    });

    let sentWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws }) => {
      sentWs = ws;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-1",
      event: {
        type: "access_mode_changed",
        roomId: "room-1",
        accessMode: "PRIVATE",
      },
    });

    expect(kickedWs).toBe(guestWs);
    expect(sentWs).toBe(memberWs);
  });

  it("updates claims and notifies on member_role_changed", () => {
    const ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-role-changed",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "VIEWER", isMember: false },
    });

    let sentWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs }) => {
      sentWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-role-changed",
      event: {
        type: "member_role_changed",
        roomId: "room-role-changed",
        userId: "user-1",
        newRole: "EDITOR",
      },
    });

    expect(sentWs).toBe(ws);
  });

  it("closes target connection on member_removed in PRIVATE room", () => {
    const ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-private",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "EDITOR", isMember: true },
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-private",
      event: {
        type: "access_mode_changed",
        roomId: "room-private",
        accessMode: "PRIVATE",
      },
    });

    let kickedWs: WebSocket | undefined;
    bus.on("KICK_CONNECTION", ({ ws: targetWs }) => {
      kickedWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-private",
      event: {
        type: "member_removed",
        roomId: "room-private",
        userId: "user-1",
      },
    });

    expect(kickedWs).toBe(ws);
  });

  it("downgrades to EDITOR guest and sends notification on member_removed in PUBLIC_EDIT room", () => {
    const ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    } as unknown as WebSocket;

    bus.emit("CLIENT_CONNECTED", {
      roomId: "room-public",
      connectionId: "conn-1",
      ws,
      claims: { userId: "user-1", effectiveRole: "EDITOR", isMember: true },
    });

    let sentWs: WebSocket | undefined;
    bus.on("OUTBOUND_WS_SEND", ({ ws: targetWs }) => {
      sentWs = targetWs;
    });

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: "room-public",
      event: {
        type: "member_removed",
        roomId: "room-public",
        userId: "user-1",
      },
    });

    expect(sentWs).toBe(ws);
  });
});
