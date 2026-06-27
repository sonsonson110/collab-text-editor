import { TypedEventEmitter } from "../../infra";
import type { PermissionEvent } from "../../types";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  MSG_PERMISSION_CHANGED,
  WS_CLOSE_FORBIDDEN,
} from "../../types";
import type { TicketClaims } from "../../auth";
import { getRoomState } from "../room";
import { WebSocket } from "ws";

const connectionClaims = new WeakMap<WebSocket, TicketClaims>();

function sendPermissionChanged(
  bus: TypedEventEmitter,
  ws: WebSocket,
  event: PermissionEvent,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_PERMISSION_CHANGED);
  encoding.writeVarString(encoder, JSON.stringify(event));

  bus.emit("OUTBOUND_WS_SEND", { ws, message: encoding.toUint8Array(encoder) });
}

export function createPermissionService(bus: TypedEventEmitter): void {
  // We need to keep our own mapped connection claims
  bus.on("CLIENT_CONNECTED", ({ ws, claims }) => {
    connectionClaims.set(ws, claims);
  });

  // Intercept incoming sync messages to block viewer writes
  bus.on("INBOUND_SYNC_MESSAGE", (payload) => {
    const { message, origin, ws } = payload;

    if (origin === "redis" || !ws) {
      // Direct pass-through
      bus.emit("PERMITTED_SYNC_MESSAGE", payload);
      return;
    }

    const claims = connectionClaims.get(ws);
    const isViewer = claims?.effectiveRole === "VIEWER";

    if (isViewer) {
      // Peek into the message to see if it's an Update (subtype 2)
      const peekDecoder = decoding.createDecoder(message);
      decoding.readVarUint(peekDecoder); // MSG_SYNC type byte
      const syncMsgType = decoding.readVarUint(peekDecoder);

      if (syncMsgType === 2) {
        // Silently drop
        return;
      }
    }

    // Allowed, pass it on
    bus.emit("PERMITTED_SYNC_MESSAGE", payload);
  });

  // Real-time permission change processing
  bus.on("REDIS_PERMISSION_EVENT", ({ roomId, event }) => {
    const room = getRoomState(roomId);
    if (!room) return;

    if (event.type === "access_mode_changed" && event.accessMode) {
      room.accessMode = event.accessMode;

      room.connections.forEach((ws) => {
        const claims = connectionClaims.get(ws);
        if (!claims) return;

        if (!claims.isMember) {
          const updatedRole =
            event.accessMode === "PUBLIC_EDIT" ? "EDITOR" : "VIEWER";
          connectionClaims.set(ws, { ...claims, effectiveRole: updatedRole });
        }

        if (event.accessMode === "PRIVATE") {
          if (claims.isMember) {
            sendPermissionChanged(bus, ws, event);
          } else {
            bus.emit("KICK_CONNECTION", {
              ws,
              code: WS_CLOSE_FORBIDDEN,
              reason: "Room is now private",
            });
          }
        } else {
          sendPermissionChanged(bus, ws, event);
        }
      });
    } else if (
      event.type === "member_role_changed" &&
      event.userId &&
      event.newRole
    ) {
      room.connections.forEach((ws) => {
        const claims = connectionClaims.get(ws);
        if (claims && claims.userId === event.userId) {
          connectionClaims.set(ws, {
            ...claims,
            effectiveRole: event.newRole!,
            isMember: true,
          });
          sendPermissionChanged(bus, ws, event);
        }
      });
    } else if (event.type === "member_removed" && event.userId) {
      room.connections.forEach((ws) => {
        const claims = connectionClaims.get(ws);
        if (claims && claims.userId === event.userId) {
          if (room.accessMode === "PRIVATE") {
            bus.emit("KICK_CONNECTION", {
              ws,
              code: WS_CLOSE_FORBIDDEN,
              reason: "You have been removed from this room",
            });
          } else {
            const guestRole =
              room.accessMode === "PUBLIC_EDIT" ? "EDITOR" : "VIEWER";
            connectionClaims.set(ws, {
              ...claims,
              effectiveRole: guestRole,
              isMember: false,
            });
            sendPermissionChanged(bus, ws, event);
          }
        }
      });
    }
  });
}
