/**
 * Internal HTTP permission handler for the sync-server.
 *
 * Handles POST /internal/rooms/:roomId/permission-changed events sent by the api-server
 * after a room permission mutation (access mode change, member role change, member removal).
 *
 * Authentication: validates the `x-internal-secret` header against the shared secret.
 *
 * Event types dispatched via the JSON body:
 *   - `access_mode_changed` — Broadcasts MSG_PERMISSION_CHANGED to all clients in the room.
 *     Closes connections with code 4403 for clients who no longer have access (PRIVATE mode).
 *   - `member_role_changed` — Sends a targeted MSG_PERMISSION_CHANGED to connections
 *     matching the `userId` claim in their JWT.
 *   - `member_removed` — Closes connections for the target userId with code 4403.
 *
 * Message type 5 is used to avoid collision with y-websocket built-ins:
 *   0 = Sync, 1 = Awareness, 2 = Auth, 3 = QueryAwareness, 4 = SnapshotSaved.
 */

import Redis from "ioredis";
import * as encoding from "lib0/encoding";
import { WebSocket } from "ws";

/** Custom message type for real-time permission events. */
export const MSG_PERMISSION_CHANGED = 5;

/** WebSocket close code sent to clients who lose room access. */
export const WS_CLOSE_FORBIDDEN = 4403;

/** Redis channel name used for room permission change events. */
export const REDIS_CHANNEL_ROOM_PERMISSIONS = "room-permissions";

/** Event type sent when a room's access mode changes. */
export const EVENT_ACCESS_MODE_CHANGED = "access_mode_changed";

/** Event type sent when a room member's role changes. */
export const EVENT_MEMBER_ROLE_CHANGED = "member_role_changed";

/** Event type sent when a room member is removed. */
export const EVENT_MEMBER_REMOVED = "member_removed";

export interface PermissionEvent {
  type:
    | typeof EVENT_ACCESS_MODE_CHANGED
    | typeof EVENT_MEMBER_ROLE_CHANGED
    | typeof EVENT_MEMBER_REMOVED;
  roomId: string;
  /** Present for access_mode_changed. */
  accessMode?: string;
  /** Present for member_role_changed and member_removed — the affected user's UUID. */
  userId?: string;
  /** Present for member_role_changed — the new role name. */
  newRole?: string;
}

/**
 * Per-room state passed into the handler so it can reach WebSocket connections.
 * Only the fields required by the handler are typed here.
 */
export interface RoomState {
  connections: Set<WebSocket>;
  /** Current access mode of the room — kept in sync by this handler. */
  accessMode: string;
}

/**
 * Maps each WebSocket to the JWT claims extracted at connection time.
 * Passed in from index.ts so the handler can match connections by userId.
 */
export type ConnectionClaimsMap = WeakMap<
  WebSocket,
  { userId: string; effectiveRole: string; isMember: boolean }
>;

/**
 * Encodes and sends a MSG_PERMISSION_CHANGED binary message to a single WebSocket.
 *
 * Payload layout:
 *   VarUint: MSG_PERMISSION_CHANGED (5)
 *   VarString: JSON-encoded PermissionEvent
 */
function sendPermissionChanged(ws: WebSocket, event: PermissionEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_PERMISSION_CHANGED);
  encoding.writeVarString(encoder, JSON.stringify(event));
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Handles a parsed PermissionEvent for a given room.
 *
 * @param room             The in-memory room state (connections + accessMode).
 * @param event            The parsed event from the api-server request body.
 * @param connectionClaims WeakMap of WebSocket → JWT claims for userId matching.
 */
export function handlePermissionEvent(
  room: RoomState,
  event: PermissionEvent,
  connectionClaims: ConnectionClaimsMap,
): void {
  if (event.type === EVENT_ACCESS_MODE_CHANGED && event.accessMode) {
    // Update in-memory room state so future message handling uses the new mode.
    room.accessMode = event.accessMode;

    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);
      if (!claims) return;

      // Explicit members keep their existing role.
      // Public-access guests re-derive from the new access mode.
      if (!claims.isMember) {
        const updatedRole =
          event.accessMode === "PUBLIC_EDIT" ? "EDITOR" : "VIEWER";
        connectionClaims.set(ws, { ...claims, effectiveRole: updatedRole });
      }

      if (event.accessMode === "PRIVATE") {
        // PRIVATE mode: explicit DB members (isMember === true) keep their connection.
        // Public-access connections (isMember === false) are closed immediately.
        //
        // `isMember` is embedded in the JWT ticket at connect time by the api-server:
        //   - OWNER and explicit room_members rows → isMember = true
        //   - Connections derived from PUBLIC_EDIT / PUBLIC_VIEW → isMember = false
        //
        // This avoids any api-server round-trip on the hot path while correctly
        // preserving the OWNER's and all explicit members' sessions.
        if (claims.isMember) {
          // Explicit member — stay connected. Notify so the client updates the
          // access-mode badge in the UI (e.g. RoomAccessIndicator turns to 🔒).
          sendPermissionChanged(ws, event);
        } else {
          // Public-access connection — close with 4403.
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(WS_CLOSE_FORBIDDEN, "Room is now private");
          }
        }
      } else {
        // PUBLIC_EDIT or PUBLIC_VIEW: broadcast the change so clients re-derive their role.
        sendPermissionChanged(ws, event);
      }
    });
  } else if (
    event.type === EVENT_MEMBER_ROLE_CHANGED &&
    event.userId &&
    event.newRole
  ) {
    // Targeted: find connections belonging to the affected user and notify them.
    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);
      if (claims && claims.userId === event.userId) {
        // Update BOTH effectiveRole and isMember.
        // If they're receiving a role change, they are a DB member now.
        connectionClaims.set(ws, {
          ...claims,
          effectiveRole: event.newRole!,
          isMember: true,
        });
        sendPermissionChanged(ws, event);
      }
    });
  } else if (event.type === EVENT_MEMBER_REMOVED && event.userId) {
    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);
      if (claims && claims.userId === event.userId) {
        if (room.accessMode === "PRIVATE") {
          // PRIVATE: no public fallback exists — hard-kick.
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(WS_CLOSE_FORBIDDEN, "You have been removed from this room");
          }
        } else {
          // PUBLIC_EDIT or PUBLIC_VIEW: downgrade to public guest level.
          const guestRole =
            room.accessMode === "PUBLIC_EDIT" ? "EDITOR" : "VIEWER";
          connectionClaims.set(ws, {
            ...claims,
            effectiveRole: guestRole,
            isMember: false,
          });
          sendPermissionChanged(ws, event);
        }
      }
    });
  }
}

/**
 * Wires permission-changed handling onto the provided Redis subscriber client.
 *
 * Instead of creating its own connection, this function accepts a pre-existing
 * `Redis` subscriber instance (e.g., the shared `redisSubscriber` from `redis.ts`),
 * which eliminates the need for an additional Redis connection solely for this channel.
 *
 * Expected channel: {@link REDIS_CHANNEL_ROOM_PERMISSIONS}
 * Expected message: JSON-encoded {@link PermissionEvent}
 *
 * @param subscriber       An ioredis client already in (or to be put into) subscribe mode.
 * @param rooms            The sync-server's in-memory room map.
 * @param connectionClaims WeakMap of WebSocket → JWT claims.
 */
export function createRedisSubscriber(
  subscriber: Redis,
  rooms: Map<string, RoomState>,
  connectionClaims: ConnectionClaimsMap,
): void {
  subscriber.on("message", (channel, message) => {
    if (channel !== REDIS_CHANNEL_ROOM_PERMISSIONS) return;

    let event: PermissionEvent;
    try {
      event = JSON.parse(message) as PermissionEvent;
    } catch (err) {
      console.error(
        `[RedisSubscriber] Invalid JSON message on ${REDIS_CHANNEL_ROOM_PERMISSIONS}:`,
        err,
      );
      return;
    }

    if (!event.roomId) {
      console.warn("[RedisSubscriber] Missing roomId in event");
      return;
    }

    const room = rooms.get(event.roomId);
    if (!room) {
      // Room not loaded in memory — nothing to do.
      return;
    }

    handlePermissionEvent(room, event, connectionClaims);
  });

  subscriber.subscribe(REDIS_CHANNEL_ROOM_PERMISSIONS, (err) => {
    if (err) {
      console.error(
        `[RedisSubscriber] Failed to subscribe to ${REDIS_CHANNEL_ROOM_PERMISSIONS}:`,
        err,
      );
    } else {
      console.log(
        `[RedisSubscriber] Subscribed to ${REDIS_CHANNEL_ROOM_PERMISSIONS} channel`,
      );
    }
  });
}
