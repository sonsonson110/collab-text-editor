import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  handlePermissionEvent,
  EVENT_ACCESS_MODE_CHANGED,
  EVENT_MEMBER_ROLE_CHANGED,
  EVENT_MEMBER_REMOVED,
  WS_CLOSE_FORBIDDEN,
  type RoomState,
  type ConnectionClaimsMap,
} from "./permissionHandler.js";

describe("permissionHandler", () => {
  it("updates guest roles and broadcasts on access_mode_changed to PUBLIC_EDIT", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_VIEW",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "VIEWER",
      isMember: false,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_ACCESS_MODE_CHANGED,
        roomId: "room-1",
        accessMode: "PUBLIC_EDIT",
      },
      connectionClaims,
    );

    // Verify room accessMode is updated
    expect(room.accessMode).toBe("PUBLIC_EDIT");

    // Verify connection claims are mutated
    const updatedClaims = connectionClaims.get(ws);
    expect(updatedClaims?.effectiveRole).toBe("EDITOR");
    expect(updatedClaims?.isMember).toBe(false);

    // Verify message sent
    expect(ws.send).toHaveBeenCalled();
  });

  it("updates guest roles and broadcasts on access_mode_changed to PUBLIC_VIEW", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_EDIT",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "EDITOR",
      isMember: false,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_ACCESS_MODE_CHANGED,
        roomId: "room-1",
        accessMode: "PUBLIC_VIEW",
      },
      connectionClaims,
    );

    expect(room.accessMode).toBe("PUBLIC_VIEW");

    const updatedClaims = connectionClaims.get(ws);
    expect(updatedClaims?.effectiveRole).toBe("VIEWER");
    expect(updatedClaims?.isMember).toBe(false);

    expect(ws.send).toHaveBeenCalled();
  });

  it("retains explicit member roles on access_mode_changed", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_VIEW",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "EDITOR", // explicit member role
      isMember: true,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_ACCESS_MODE_CHANGED,
        roomId: "room-1",
        accessMode: "PUBLIC_VIEW",
      },
      connectionClaims,
    );

    const updatedClaims = connectionClaims.get(ws);
    // Explicit member keeps their role (doesn't get overwritten to VIEWER)
    expect(updatedClaims?.effectiveRole).toBe("EDITOR");
    expect(updatedClaims?.isMember).toBe(true);

    expect(ws.send).toHaveBeenCalled();
  });

  it("closes public connections and retains member connections on transition to PRIVATE", () => {
    const guestWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const memberWs = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([guestWs, memberWs]),
      accessMode: "PUBLIC_EDIT",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(guestWs, {
      userId: "guest-1",
      effectiveRole: "EDITOR",
      isMember: false,
    });
    connectionClaims.set(memberWs, {
      userId: "member-1",
      effectiveRole: "EDITOR",
      isMember: true,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_ACCESS_MODE_CHANGED,
        roomId: "room-1",
        accessMode: "PRIVATE",
      },
      connectionClaims,
    );

    // Guest should be closed
    expect(guestWs.close).toHaveBeenCalledWith(WS_CLOSE_FORBIDDEN, expect.any(String));
    expect(guestWs.send).not.toHaveBeenCalled();

    // Member should stay connected and get notified
    expect(memberWs.close).not.toHaveBeenCalled();
    expect(memberWs.send).toHaveBeenCalled();
  });

  it("updates claims and notifies on member_role_changed", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_EDIT",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "VIEWER",
      isMember: false, // joins as guest
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_MEMBER_ROLE_CHANGED,
        roomId: "room-1",
        userId: "user-1",
        newRole: "EDITOR",
      },
      connectionClaims,
    );

    const updatedClaims = connectionClaims.get(ws);
    expect(updatedClaims?.effectiveRole).toBe("EDITOR");
    expect(updatedClaims?.isMember).toBe(true); // Promoted to explicit member

    expect(ws.send).toHaveBeenCalled();
  });

  it("closes target connection on member_removed in PRIVATE room", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PRIVATE",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "EDITOR",
      isMember: true,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_MEMBER_REMOVED,
        roomId: "room-1",
        userId: "user-1",
      },
      connectionClaims,
    );

    expect(ws.close).toHaveBeenCalledWith(WS_CLOSE_FORBIDDEN, expect.any(String));
  });

  it("downgrades to EDITOR guest and sends notification on member_removed in PUBLIC_EDIT room", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_EDIT",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "EDITOR",
      isMember: true,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_MEMBER_REMOVED,
        roomId: "room-1",
        userId: "user-1",
      },
      connectionClaims,
    );

    expect(ws.close).not.toHaveBeenCalled();
    const updatedClaims = connectionClaims.get(ws);
    expect(updatedClaims?.effectiveRole).toBe("EDITOR");
    expect(updatedClaims?.isMember).toBe(false);
    expect(ws.send).toHaveBeenCalled();
  });

  it("downgrades to VIEWER guest and sends notification on member_removed in PUBLIC_VIEW room", () => {
    const ws = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const room: RoomState = {
      connections: new Set([ws]),
      accessMode: "PUBLIC_VIEW",
    };

    const connectionClaims: ConnectionClaimsMap = new WeakMap();
    connectionClaims.set(ws, {
      userId: "user-1",
      effectiveRole: "EDITOR",
      isMember: true,
    });

    handlePermissionEvent(
      room,
      {
        type: EVENT_MEMBER_REMOVED,
        roomId: "room-1",
        userId: "user-1",
      },
      connectionClaims,
    );

    expect(ws.close).not.toHaveBeenCalled();
    const updatedClaims = connectionClaims.get(ws);
    expect(updatedClaims?.effectiveRole).toBe("VIEWER");
    expect(updatedClaims?.isMember).toBe(false);
    expect(ws.send).toHaveBeenCalled();
  });
});
