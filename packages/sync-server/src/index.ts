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
 *   Clients must supply a signed JWT in the `?token=<jwt>` query parameter of
 *   the WebSocket upgrade URL.  The token is verified locally (no Spring call)
 *   via {@link verifyToken}.  Invalid or missing tokens cause the upgrade to be
 *   rejected with WebSocket close code 4401 before the connection is opened.
 *
 * Snapshot persistence (Phase 3):
 *   When a room is created, the latest binary Yjs snapshot is fetched from the
 *   api-server and applied to the Y.Doc before accepting connections.
 *   Document changes trigger debounced + max-wait saves back to the api-server.
 *   A final save is performed when the last client disconnects.
 */

import { WebSocketServer, WebSocket } from "ws";
import * as http from "node:http";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { IncomingMessage } from "node:http";
import { verifyRoomTicket, type TicketClaims } from "./auth/jwtVerifier.js";
import { fetchSnapshot } from "./api/snapshotClient.js";
import { startTracking, stopTracking } from "./snapshot/snapshotScheduler.js";
import {
  createRedisSubscriber,
  MSG_PERMISSION_CHANGED,
  type RoomState,
} from "./api/permissionHandler.js";

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
 * On creation, the latest snapshot is fetched from the api-server and applied
 * to the Y.Doc so document state survives sync-server restarts.
 * The snapshot scheduler is also started to persist future changes.
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
   */
  doc.on("update", (update: Uint8Array, origin: WebSocket | null) => {
    const msg = encoding.createEncoder();
    encoding.writeVarUint(msg, MSG_SYNC);
    syncProtocol.writeUpdate(msg, update);
    const encoded = encoding.toUint8Array(msg);

    room.connections.forEach((conn) => {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) {
        conn.send(encoded);
      }
    });
  });

  /**
   * Broadcast awareness changes (cursor positions, user metadata) to all
   * clients except the originator.
   */
  awareness.on(
    "update",
    (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      origin: WebSocket | null,
    ) => {
      const changed = [...added, ...updated, ...removed];
      const msg = encoding.createEncoder();
      encoding.writeVarUint(msg, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        msg,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
      );
      const encoded = encoding.toUint8Array(msg);

      room.connections.forEach((conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(encoded);
        }
      });
    },
  );

  // Start debounced snapshot persistence for this room.
  // The onSaved callback broadcasts the save timestamp to all connected
  // clients via a custom MSG_SNAPSHOT_SAVED message.
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
): void {
  room.connections.add(ws);

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
        //
        // A connection is write-blocked if:
        //   (a) Their ticket effectiveRole is "VIEWER" (set at connect time), OR
        //   (b) The room's current accessMode is PUBLIC_VIEW and they have no explicit
        //       member-level write role (i.e., they joined as a public EDITOR and the
        //       owner just changed the mode to PUBLIC_VIEW).
        //
        // Case (b) ensures real-time enforcement: when the owner switches the room to
        // PUBLIC_VIEW, existing editor connections are blocked immediately without a
        // reconnect. The client receives MSG_PERMISSION_CHANGED and shows a read-only
        // indicator, but the server-side block is the authoritative enforcement layer.
        const isViewerByTicket = claims?.effectiveRole === "VIEWER";
        const isViewerByRoomMode =
          room.accessMode === "PUBLIC_VIEW" &&
          claims?.effectiveRole !== "OWNER" &&
          claims?.effectiveRole !== "EDITOR";
        const isViewer = isViewerByTicket || isViewerByRoomMode;

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
  const roomName =
    new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname.replace(
      /^\//,
      "",
    ) || "default";

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

    // When the last client leaves, persist a final snapshot and tear down the room.
    if (room.connections.size === 0) {
      void stopTracking(roomName, room.doc).then(() => {
        room.awareness.destroy();
        rooms.delete(roomName);
      });
    }
  });

  ws.on("error", (err) => {
    console.error("[server] WebSocket error:", err);
  });
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "1234", 10);

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

    handleConnection(ws, req, room);

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
// Redis Subscriber for api-server → sync-server permission notifications
// ---------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
createRedisSubscriber(redisUrl, rooms, connectionClaims);
