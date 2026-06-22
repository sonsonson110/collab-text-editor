/**
 * Shared Redis client module for the sync-server.
 *
 * Exports two separate ioredis instances:
 *   - `redis`      — for SET/GET caching and PUBLISH operations.
 *   - `subscriber` — dedicated connection required by ioredis for Pub/Sub
 *                    (a client in subscribe mode cannot issue regular commands).
 *
 * Also exports:
 *   - `NODE_ID`           — a UUID uniquely identifying this process instance.
 *                          Embedded in Pub/Sub payloads to prevent echo loops.
 *   - `setupSyncPubSub`   — subscribes to `room:sync:*` and fans out cross-node
 *                          Y.Doc / Awareness updates to locally connected clients.
 *   - `publishSyncUpdate` — publishes a Y.Doc update buffer for a room.
 *   - `publishAwarenessUpdate` — publishes an Awareness update buffer for a room.
 */

import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import Redis from "ioredis";
import type { RoomState } from "./api/permissionHandler.js";

/** Discriminates Y.Doc updates from Awareness updates in the Redis payload. */
const PAYLOAD_TYPE_DOC = "doc";
const PAYLOAD_TYPE_AWARENESS = "awareness";

/** Redis channel prefix for per-room sync messages. */
export const REDIS_CHANNEL_ROOM_SYNC_PREFIX = "room:sync:";

/** Redis key prefix for cached room Yjs snapshots. */
export const REDIS_KEY_ROOM_STATE_PREFIX = "room:state:";

/**
 * Unique identifier for this sync-server node instance.
 * Regenerated on every process start, so two instances never share an ID.
 * Used as the sender discriminator in cross-node Redis payloads to prevent
 * a node from processing its own echoed messages.
 */
export const NODE_ID: string = randomUUID();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * General-purpose Redis client used for:
 *   - Binary key-value operations (room snapshot caching via GET/SET).
 *   - Publishing cross-node sync/awareness messages (PUBLISH).
 */
export const redis = new Redis(redisUrl);

redis.on("error", (err: Error) => {
  console.error("[Redis] Client error:", err.message);
});

/**
 * Dedicated subscriber client.
 * ioredis requires a separate connection for Pub/Sub; once a client calls
 * `subscribe` or `psubscribe`, it can no longer issue regular Redis commands.
 */
export const redisSubscriber = new Redis(redisUrl);

redisSubscriber.on("error", (err: Error) => {
  console.error("[Redis] Subscriber error:", err.message);
});

// ---------------------------------------------------------------------------
// Payload encoding
// ---------------------------------------------------------------------------

interface SyncPayload {
  /** The originating node — used to drop self-echoes. */
  nodeId: string;
  /** Discriminates doc vs. awareness updates. */
  type: typeof PAYLOAD_TYPE_DOC | typeof PAYLOAD_TYPE_AWARENESS;
  /** Base64-encoded binary update buffer. */
  data: string;
}

function encodePayload(
  type: SyncPayload["type"],
  buffer: Uint8Array,
): string {
  const payload: SyncPayload = {
    nodeId: NODE_ID,
    type,
    data: Buffer.from(buffer).toString("base64"),
  };
  return JSON.stringify(payload);
}

function decodePayload(raw: string): SyncPayload | null {
  try {
    return JSON.parse(raw) as SyncPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MSG_SYNC / MSG_AWARENESS constants mirrored here to avoid a circular import.
// ---------------------------------------------------------------------------

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The room shape required by the cross-node sync fan-out.
 * index.ts's Room interface extends RoomState and adds doc + awareness,
 * making it a structural subtype of this interface.
 */
export interface SyncRoomState extends RoomState {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
}

/**
 * Subscribes `redisSubscriber` to `room:sync:*` and wires up cross-node
 * message handling. Call once on server startup.
 *
 * When a message arrives from another node:
 *   1. Self-echo guard: messages from this `NODE_ID` are discarded.
 *   2. The payload is decoded from Base64 and applied locally.
 *   3. The update is broadcast to all locally connected WebSockets for that room.
 *
 * @param rooms The sync-server's live in-memory room map.
 */
export function setupSyncPubSub(rooms: Map<string, SyncRoomState>): void {
  redisSubscriber.psubscribe(`${REDIS_CHANNEL_ROOM_SYNC_PREFIX}*`, (err) => {
    if (err) {
      console.error("[Redis] Failed to psubscribe to room:sync:*:", err.message);
    } else {
      console.log("[Redis] Subscribed to room:sync:* channel pattern");
    }
  });

  redisSubscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const roomId = channel.slice(REDIS_CHANNEL_ROOM_SYNC_PREFIX.length);
    const room = rooms.get(roomId);
    if (!room) return; // Room not loaded on this node — nothing to do.

    const payload = decodePayload(message);
    if (!payload) {
      console.warn("[Redis] Received invalid sync payload on channel:", channel);
      return;
    }

    // Discard messages originating from this node to prevent echo loops.
    if (payload.nodeId === NODE_ID) return;

    const buffer = new Uint8Array(Buffer.from(payload.data, "base64"));

    if (payload.type === PAYLOAD_TYPE_DOC) {
      // Apply remote update to local Y.Doc with origin = "redis" so the
      // doc.on("update") handler can distinguish it from local client updates
      // and skip republishing to Redis.
      Y.applyUpdate(room.doc, buffer, "redis");

      // Encode and forward to all locally connected clients.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      // y-protocols Update sub-type = 2
      encoding.writeVarUint(encoder, 2);
      encoding.writeVarUint8Array(encoder, buffer);
      const encoded = encoding.toUint8Array(encoder);

      room.connections.forEach((ws) => {
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(encoded);
        }
      });
    } else if (payload.type === PAYLOAD_TYPE_AWARENESS) {
      // Apply to local awareness with origin = "redis" to avoid re-publishing.
      awarenessProtocol.applyAwarenessUpdate(room.awareness, buffer, "redis");

      // Forward the raw awareness message to local clients.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(encoder, buffer);
      const encoded = encoding.toUint8Array(encoder);

      room.connections.forEach((ws) => {
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(encoded);
        }
      });
    }
  });
}

/**
 * Publishes a Y.Doc update buffer to the cross-node Redis channel for the room.
 * Only called when the update origin is NOT "redis" (i.e., it came from a local client).
 *
 * @param roomId    The room UUID string.
 * @param updateBuf The raw Yjs update Uint8Array from `doc.on("update")`.
 */
export function publishSyncUpdate(roomId: string, updateBuf: Uint8Array): void {
  const channel = `${REDIS_CHANNEL_ROOM_SYNC_PREFIX}${roomId}`;
  redis
    .publish(channel, encodePayload(PAYLOAD_TYPE_DOC, updateBuf))
    .catch((err: Error) => {
      console.error(`[Redis] Failed to publish sync update for room ${roomId}:`, err.message);
    });
}

/**
 * Publishes an Awareness update buffer to the cross-node Redis channel for the room.
 * Only called when the update origin is NOT "redis".
 *
 * @param roomId    The room UUID string.
 * @param updateBuf The raw awareness update Uint8Array.
 */
export function publishAwarenessUpdate(roomId: string, updateBuf: Uint8Array): void {
  const channel = `${REDIS_CHANNEL_ROOM_SYNC_PREFIX}${roomId}`;
  redis
    .publish(channel, encodePayload(PAYLOAD_TYPE_AWARENESS, updateBuf))
    .catch((err: Error) => {
      console.error(`[Redis] Failed to publish awareness update for room ${roomId}:`, err.message);
    });
}
