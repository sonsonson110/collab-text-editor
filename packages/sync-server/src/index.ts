/**
 * Collaboration WebSocket Server
 *
 * Implements the Yjs sync protocol (y-protocols/sync) and awareness protocol
 * (y-protocols/awareness) directly over a `ws` WebSocket server.
 *
 * This replaces the y-websocket v1/v2 `setupWSConnection` helper which was
 * removed in y-websocket v3 (the package is now client-only).
 *
 * Protocol message types:
 *   0 — Sync      (SyncStep1, SyncStep2, Update)
 *   1 — Awareness (remote cursor / presence state)
 *
 * Authentication (Phase 2):
 *   Clients must supply a signed JWT in the `?ticket=<jwt>` query parameter of
 *   the WebSocket upgrade URL.  The token is verified locally (no Spring call)
 *   via {@link verifyRoomTicket}.  Invalid or missing tickets cause the upgrade
 *   to be rejected with WebSocket close code 4401 before the connection is opened.
 *
 * Snapshot persistence (Phase 3 — Incremental):
 *   - On room creation, the latest binary Yjs snapshot is fetched from Redis
 *     (Phase 2 cache) or the api-server (PostgreSQL fallback) and applied to
 *     the Y.Doc before accepting connections.
 *   - Every document delta is buffered in memory and flushed to a Redis Stream
 *     (`room:updates:<roomId>`) every 1 second via {@link deltaScheduler}.
 *   - A background compaction worker merges stream deltas into a full PostgreSQL
 *     snapshot every 30 seconds and on final room teardown.
 *   - A distributed presence counter (`room:connections:<roomId>`) tracks the
 *     global number of live WebSocket connections across all nodes, enabling
 *     accurate last-client detection without relying on local connection set size.
 */

import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { IncomingMessage } from "node:http";
import { verifyRoomTicket, type TicketClaims } from "./auth/jwtVerifier.js";
import { fetchSnapshot } from "./api/snapshotClient.js";
import { startTracking, stopTracking } from "./snapshot/deltaScheduler.js";
import {
  createRedisSubscriber,
  MSG_PERMISSION_CHANGED,
  type RoomState,
} from "./api/permissionHandler.js";
import {
  redisSubscriber,
  setupSyncPubSub,
  publishSyncUpdate,
  publishAwarenessUpdate,
  incrementPresence,
  decrementPresence,
  type SyncRoomState,
} from "./redis.js";
import { startHeartbeat, stopHeartbeat } from "./snapshot/presenceCounter.js";
import {
  startCompactionWorker,
  triggerImmediateCompaction,
  type CompactionRoomState,
} from "./snapshot/compactionWorker.js";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

/**
 * Custom message type broadcast to all clients after a snapshot is persisted.
 * Payload: a single Float64 representing the save timestamp (epoch ms).
 *
 * Index 4 is chosen to avoid collision with y-websocket's built-in types:
 * 0 = Sync, 1 = Awareness, 2 = Auth, 3 = QueryAwareness.
 */
const MSG_SNAPSHOT_SAVED = 4;

// MSG_PERMISSION_CHANGED = 5 is imported from permissionHandler.

/**
 * Close code sent to clients whose JWT is missing or invalid.
 * 4401 is in the application-reserved range (4000–4999).
 */
const WS_CLOSE_UNAUTHORIZED = 4401;

/**
 * Close code sent to clients who lose room access due to a permission change.
 * 4403 is in the application-reserved range (4000–4999).
 */
const WS_CLOSE_FORBIDDEN = 4403;

// ---------------------------------------------------------------------------
// Per-connection identity store
// ---------------------------------------------------------------------------

/**
 * Maps each authenticated WebSocket to the claims extracted from its JWT.
 * Using a WeakMap avoids any changes to the WebSocket type while allowing
 * automatic garbage collection when a socket is closed.
 */
const connectionClaims = new WeakMap<WebSocket, TicketClaims>();

/**
 * Maps each WebSocket to the set of Yjs awareness clientIDs it has registered.
 *
 * Populated by inspecting incoming awareness updates from that socket.
 * On disconnect, these IDs are removed from the room awareness so peers
 * immediately stop rendering stale cursors for the disconnected client.
 */
const connectionAwarenessClients = new WeakMap<WebSocket, Set<number>>();

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

interface Room extends RoomState {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  // `connections: Set<WebSocket>` and `accessMode: string` inherited from RoomState.
}

const rooms = new Map<string, Room>();

/**
 * Returns the existing room for `name`, or creates and hydrates a new one.
 *
 * On creation, the latest snapshot is fetched from Redis cache / api-server
 * and applied to the Y.Doc so document state survives sync-server restarts.
 * The delta scheduler is started to push incremental updates to the Redis
 * Stream for later compaction.
 */
async function getOrCreateRoom(name: string): Promise<Room> {
  const existing = rooms.get(name);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const room: Room = {
    doc,
    awareness,
    connections: new Set(),
    accessMode: "PUBLIC_EDIT", // default; updated by permission-change events
  };

  // Hydrate from the api-server snapshot before accepting any connections.
  // If no snapshot exists (new room), the doc stays empty.
  try {
    const snapshot = await fetchSnapshot(name);
    if (snapshot) {
      Y.applyUpdate(doc, snapshot);
      console.log(
        `[server] Hydrated room "${name}" from snapshot (${snapshot.byteLength} bytes)`,
      );
    }
  } catch (err) {
    console.error(`[server] Failed to load snapshot for room "${name}":`, err);
  }

  /**
   * Broadcast every document update to all clients in the room except the one
   * that originated the change.  The `origin` is set to the sender's WebSocket
   * via the `transactionOrigin` parameter of readSyncMessage() below.
   *
   * For cross-node sync, updates received from Redis have origin = "redis".
   * These are applied locally and broadcast to local clients but must NOT be
   * re-published to Redis to avoid infinite echo loops.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.on("update", (update: Uint8Array, origin: any) => {
    const msg = encoding.createEncoder();
    encoding.writeVarUint(msg, MSG_SYNC);
    syncProtocol.writeUpdate(msg, update);
    const encoded = encoding.toUint8Array(msg);

    room.connections.forEach((conn) => {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) {
        conn.send(encoded);
      }
    });

    // Fan-out to peer nodes via Redis — skip if the update already came from Redis.
    if (origin !== "redis") {
      publishSyncUpdate(name, update);
    }
  });

  /**
   * Broadcast awareness changes (cursor positions, user metadata) to all
   * clients except the originator.
   *
   * Like doc updates, awareness updates from Redis (origin = "redis") are
   * applied locally and forwarded to local clients, but not re-published.
   */
  awareness.on(
    "update",
    (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      origin: any,
    ) => {
      const changed = [...added, ...updated, ...removed];
      const updateBuf = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);

      const msg = encoding.createEncoder();
      encoding.writeVarUint(msg, MSG_AWARENESS);
      encoding.writeVarUint8Array(msg, updateBuf);
      const encoded = encoding.toUint8Array(msg);

      room.connections.forEach((conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(encoded);
        }
      });

      // Fan-out to peer nodes via Redis — skip if update already came from Redis.
      if (origin !== "redis") {
        publishAwarenessUpdate(name, updateBuf);
      }
    },
  );

  // Start incremental delta persistence for this room (Phase 3).
  // Raw Yjs deltas are buffered in memory and flushed to the Redis Stream
  // every 1 second. The compaction worker calls the onSaved callback after
  // each successful PostgreSQL compaction, which broadcasts MSG_SNAPSHOT_SAVED
  // so the client UI shows an accurate "Last saved" timestamp.
  startTracking(name, doc, (_roomId, timestamp) => {
    const msg = encoding.createEncoder();
    encoding.writeVarUint(msg, MSG_SNAPSHOT_SAVED);
    encoding.writeFloat64(msg, timestamp);
    const encoded = encoding.toUint8Array(msg);

    room.connections.forEach((conn) => {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(encoded);
      }
    });
  });

  rooms.set(name, room);
  return room;
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  room: Room,
  roomName: string,
): void {
  room.connections.add(ws);

  // Increment the distributed global connection counter for this room.
  // This counter spans all sync-server nodes and enables accurate last-client
  // detection at teardown without relying on the local `room.connections` size.
  void incrementPresence(roomName);

  // Ensure the per-room, per-node heartbeat is running so the compaction worker
  // can detect crashes via key expiry if this node dies unexpectedly.
  startHeartbeat(roomName);

  // Identity (userId, role) is published by each client in its own awareness
  // state — the server must not set these on its shared awareness entry because
  // each new connection would overwrite the previous one.

  // ── Initiate sync handshake with the new client ──────────────────────────
  // Send SyncStep1 (our state vector) so the client can reply with the diff.
  const initEncoder = encoding.createEncoder();
  encoding.writeVarUint(initEncoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(initEncoder, room.doc);
  ws.send(encoding.toUint8Array(initEncoder));

  // ── Send current awareness states to the new client ──────────────────────
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys()),
      ),
    );
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  // ── Handle incoming messages ──────────────────────────────────────────────
  ws.on("message", (data: Buffer) => {
    const message = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    try {
      const decoder = decoding.createDecoder(message);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        const claims = connectionClaims.get(ws);

        // Block document mutations for VIEWER connections.
        // Since connectionClaims is kept authoritative by the permission handler,
        // we can simply check the current effectiveRole.
        const isViewer = claims?.effectiveRole === "VIEWER";

        if (isViewer) {
          // Peek the sync message sub-type to identify write operations.
          // y-protocols sync sub-types:
          //   0 = SyncStep1 (client sends its state vector — read-only, needed for handshake)
          //   1 = SyncStep2 (client sends doc diff to server — read-only, needed for handshake)
          //   2 = Update    (client pushes a document mutation — must be blocked for viewers)
          //
          // SyncStep1 and SyncStep2 are both part of the mandatory initial sync
          // handshake. Blocking SyncStep2 (as was done previously) prevented the
          // handshake from completing and caused y-websocket to immediately close
          // and reconnect, creating an infinite reconnect loop for view-only clients.
          const peekDecoder = decoding.createDecoder(message);
          decoding.readVarUint(peekDecoder); // consume outer MSG_SYNC type byte
          const syncMsgType = decoding.readVarUint(peekDecoder);

          if (syncMsgType === 2) {
            // Update — actual document mutation. Silently drop; do not close
            // the connection so the viewer stays connected in read-only mode.
            return;
          }
        }

        const replyEncoder = encoding.createEncoder();
        encoding.writeVarUint(replyEncoder, MSG_SYNC);
        // Pass `ws` as the transaction origin so doc.on('update') knows not
        // to broadcast this update back to the sender.
        syncProtocol.readSyncMessage(decoder, replyEncoder, room.doc, ws);
        // Only reply if there is actual content (length > 1 means more than
        // just the message-type byte was written).
        if (encoding.length(replyEncoder) > 1) {
          ws.send(encoding.toUint8Array(replyEncoder));
        }
      } else if (msgType === MSG_AWARENESS) {
        // Viewer awareness updates are allowed through so that editors can see
        // viewers in the presence bar. The client-side hook guarantees that
        // VIEWER clients only publish their user identity (name, color,
        // lastActive) and never send cursor positions, so no stripping is
        // needed here. Blocking awareness from viewers (as was done previously)
        // made them completely invisible to everyone else in the room.

        const update = decoding.readVarUint8Array(decoder);

        // Track which awareness clientIDs this socket has registered so we can
        // clean them up precisely on disconnect.
        try {
          const updateDecoder = decoding.createDecoder(update);
          const len = decoding.readVarUint(updateDecoder);
          const tracked = connectionAwarenessClients.get(ws) ?? new Set<number>();
          for (let i = 0; i < len; i++) {
            tracked.add(decoding.readVarUint(updateDecoder));
            // Skip the clock and state (we only need the clientID).
            decoding.readVarUint(updateDecoder); // clock
            decoding.readVarUint8Array(updateDecoder); // encoded state
          }
          connectionAwarenessClients.set(ws, tracked);
        } catch {
          // Parsing errors here are non-fatal — awareness cleanup on disconnect
          // may be incomplete, but the y-protocols timeout will eventually clear it.
        }

        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          update,
          ws,
        );
      }
    } catch (err) {
      console.error("[server] Failed to process message:", err);
    }
  });

  // ── Cleanup on disconnect ─────────────────────────────────────────────────
  ws.on("close", () => {
    room.connections.delete(ws);

    // Remove the disconnected client's awareness states so peers immediately
    // stop rendering their cursor. We use the clientIDs we tracked from
    // incoming awareness updates rather than room.doc.clientID (which is the
    // server-side Yjs doc identity, not the client's).
    const clientIds = connectionAwarenessClients.get(ws);
    if (clientIds && clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(clientIds),
        null,
      );
    }

    // Decrement the global distributed presence counter.
    // We use the counter (not room.connections.size) to determine whether this
    // node is hosting the very last connection globally across all nodes.
    void decrementPresence(roomName).then((globalCount) => {
      if (globalCount === 0) {
        // This was the last connection globally — perform a full teardown.
        // Stop the heartbeat first so the key is cleaned up immediately.
        stopHeartbeat(roomName);

        // Flush remaining buffered deltas and trigger immediate compaction
        // to produce a final durable snapshot before the room is evicted.
        void stopTracking(roomName, room.doc)
          .then(() => triggerImmediateCompaction(roomName))
          .then(() => {
            room.awareness.destroy();
            rooms.delete(roomName);
          });
      } else if (room.connections.size === 0) {
        // This node has no more local connections, but other nodes still do.
        // Stop the local heartbeat but do NOT tear down the in-memory room —
        // it may receive cross-node sync updates from other nodes' clients.
        // The room will be evicted when those nodes' connections also close.
        stopHeartbeat(roomName);
      }
    });
  });

  ws.on("error", (err) => {
    console.error("[server] WebSocket error:", err);
  });
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "1234", 10);

// ---------------------------------------------------------------------------
// handleConnection needs roomName — extract it once in the connection handler
// (previously extracted inside handleConnection; now passed as a parameter).
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({
  port: PORT,

  /**
   * Runs during the HTTP upgrade handshake — before the WebSocket is opened.
   * Rejects connections whose JWT is missing or invalid with close code 4401.
   *
   * On success, the verified claims are stored in {@link connectionClaims} so
   * {@link handleConnection} can retrieve them without re-parsing the token.
   */
  verifyClient(
    info: { req: IncomingMessage },
    callback: (pass: boolean, code?: number, message?: string) => void,
  ) {
    const url = new URL(info.req.url ?? "/", `http://localhost:${PORT}`);
    const ticket = url.searchParams.get("ticket");

    if (!ticket) {
      callback(false, 401, "Missing room ticket");
      return;
    }

    const roomName = url.pathname.replace(/^\//, "") || "default";

    try {
      const claims = verifyRoomTicket(ticket, roomName);
      // Temporarily store claims keyed by the request object; we'll move them
      // to the WebSocket instance in the 'connection' event below.
      (info.req as IncomingMessage & { _claims?: TicketClaims })._claims =
        claims;
      callback(true);
    } catch (e) {
      console.error("[verifyClient] Failed to verify ticket:", (e as Error).message);
      callback(false, 401, "Invalid or expired ticket");
    }
  },
});

/**
 * Transfer claims from the upgrade request to the WebSocket instance so that
 * {@link handleConnection} can access them via the type-safe {@link connectionClaims} map.
 *
 * Room creation is async (snapshot hydration), so we await it before handling
 * the connection to ensure the Y.Doc is fully hydrated first.
 */
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const claims = (req as IncomingMessage & { _claims?: TicketClaims })
    ._claims;
  if (!claims) {
    // Should never happen — verifyClient already rejected invalid connections.
    ws.close(WS_CLOSE_UNAUTHORIZED, "Unauthorized");
    return;
  }
  connectionClaims.set(ws, claims);

  // Buffer messages that arrive before the room is ready (async hydration window).
  const pendingMessages: Buffer[] = [];
  const bufferListener = (data: Buffer) => pendingMessages.push(data);
  ws.on("message", bufferListener);

  // Room name comes from the URL path: ws://host:port/my-room → "my-room"
  const roomName =
    new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname.replace(
      /^\//,
      "",
    ) || "default";

  void getOrCreateRoom(roomName).then((room) => {
    // Remove the temporary buffer listener before wiring the real one.
    ws.off("message", bufferListener);

    // Pass roomName explicitly so handleConnection can use it for the
    // distributed presence counter and heartbeat without re-parsing the URL.
    handleConnection(ws, req, room, roomName);

    // Replay any messages received during room hydration in order.
    // Since handleConnection is fully synchronous from this point and
    // registers the new ws.on('message') handler, these emissions
    // will be caught by the correct handler.
    for (const msg of pendingMessages) {
      ws.emit("message", msg);
    }
  });
});

console.log(`Collaboration server running on ws://localhost:${PORT}`);

// ---------------------------------------------------------------------------
// Redis: permission subscriber + cross-node sync fan-out + compaction worker
// ---------------------------------------------------------------------------

// Wire the shared subscriber for the room-permissions channel.
createRedisSubscriber(redisSubscriber, rooms, connectionClaims);

// Subscribe to room:sync:* for cross-node Y.Doc / Awareness fan-out.
// Room is a structural subtype of SyncRoomState so the cast is safe.
setupSyncPubSub(rooms as Map<string, SyncRoomState>);

// Start the background compaction worker (Phase 3).
// Runs every 30 seconds across all active rooms, merging delta streams into
// durable PostgreSQL snapshots. Room is a structural subtype of
// CompactionRoomState (it has a `connections` Set).
startCompactionWorker(rooms as Map<string, CompactionRoomState>);
