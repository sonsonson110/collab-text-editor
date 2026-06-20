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

import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket } from "ws";
import * as encoding from "lib0/encoding";

/** Custom message type for real-time permission events. */
export const MSG_PERMISSION_CHANGED = 5;

/** WebSocket close code sent to clients who lose room access. */
export const WS_CLOSE_FORBIDDEN = 4403;

export interface PermissionEvent {
  type: "access_mode_changed" | "member_role_changed" | "member_removed";
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
  if (event.type === "access_mode_changed" && event.accessMode) {
    // Update in-memory room state so future message handling uses the new mode.
    room.accessMode = event.accessMode;

    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);

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
        if (claims?.isMember) {
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
  } else if (event.type === "member_role_changed" && event.userId && event.newRole) {
    // Targeted: find connections belonging to the affected user and notify them.
    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);
      if (claims?.userId === event.userId) {
        sendPermissionChanged(ws, event);
      }
    });
  } else if (event.type === "member_removed" && event.userId) {
    // Targeted: close the removed user's connection with 4403.
    room.connections.forEach((ws) => {
      const claims = connectionClaims.get(ws);
      if (claims?.userId === event.userId && ws.readyState === WebSocket.OPEN) {
        ws.close(WS_CLOSE_FORBIDDEN, "You have been removed from this room");
      }
    });
  }
}

/**
 * Creates an HTTP request handler for the internal permission-changed endpoint.
 *
 * Expected route: POST /internal/rooms/:roomId/permission-changed
 *
 * @param internalSecret   The shared secret to validate against `x-internal-secret`.
 * @param rooms            The sync-server's in-memory room map.
 * @param connectionClaims WeakMap of WebSocket → JWT claims.
 */
export function createInternalHttpHandler(
  internalSecret: string,
  rooms: Map<string, RoomState>,
  connectionClaims: ConnectionClaimsMap,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const providedSecret = req.headers["x-internal-secret"];
    if (providedSecret !== internalSecret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // ── Route matching ────────────────────────────────────────────────────────
    const match = /^\/internal\/rooms\/([^/]+)\/permission-changed$/.exec(
      req.url ?? "",
    );
    if (!match || req.method !== "POST") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const roomId = match[1]!;

    // ── Body parsing ─────────────────────────────────────────────────────────
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let event: PermissionEvent;
      try {
        event = JSON.parse(body) as PermissionEvent;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        // Room not loaded in memory (no active connections) — nothing to do.
        // The DB change is already committed; the next connection will see it.
        res.writeHead(204);
        res.end();
        return;
      }

      handlePermissionEvent(room, event, connectionClaims);

      res.writeHead(204);
      res.end();
    });
  };
}
