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
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { IncomingMessage } from "node:http";
import { verifyToken, type VerifiedClaims } from "./auth/jwtVerifier.js";
import { fetchSnapshot } from "./api/snapshotClient.js";
import { startTracking, stopTracking } from "./snapshot/snapshotScheduler.js";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

/**
 * Close code sent to clients whose JWT is missing or invalid.
 * 4401 is in the application-reserved range (4000–4999).
 */
const WS_CLOSE_UNAUTHORIZED = 4401;

// ---------------------------------------------------------------------------
// Per-connection identity store
// ---------------------------------------------------------------------------

/**
 * Maps each authenticated WebSocket to the claims extracted from its JWT.
 * Using a WeakMap avoids any changes to the WebSocket type while allowing
 * automatic garbage collection when a socket is closed.
 */
const connectionClaims = new WeakMap<WebSocket, VerifiedClaims>();

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WebSocket>;
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
  const room: Room = { doc, awareness, connections: new Set() };

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
  startTracking(name, doc);

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

  // Retrieve the identity attached during the upgrade handshake.
  const claims = connectionClaims.get(ws)!; // guaranteed by verifyClient

  // ── Seed Yjs awareness with the authenticated identity ──────────────────
  // This is the Phase 4 foundation: the editor UI reads `userId` and `role`
  // from the peer's awareness state to determine permissions and display names
  // without any additional round-trip to the server.
  room.awareness.setLocalStateField("userId", claims.userId);
  room.awareness.setLocalStateField("role", claims.role);

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
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
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
    // Remove the disconnected client's awareness state so other clients stop
    // rendering their cursor.
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [room.doc.clientID],
      null,
    );
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
    const token = url.searchParams.get("token");

    if (!token) {
      callback(false, WS_CLOSE_UNAUTHORIZED, "Missing token");
      return;
    }

    try {
      const claims = verifyToken(token);
      // Temporarily store claims keyed by the request object; we'll move them
      // to the WebSocket instance in the 'connection' event below.
      (info.req as IncomingMessage & { _claims?: VerifiedClaims })._claims =
        claims;
      callback(true);
    } catch {
      callback(false, WS_CLOSE_UNAUTHORIZED, "Invalid or expired token");
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
  const claims = (req as IncomingMessage & { _claims?: VerifiedClaims })
    ._claims;
  if (!claims) {
    // Should never happen — verifyClient already rejected invalid connections.
    ws.close(WS_CLOSE_UNAUTHORIZED, "Unauthorized");
    return;
  }
  connectionClaims.set(ws, claims);

  // Room name comes from the URL path: ws://host:port/my-room → "my-room"
  const roomName =
    new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname.replace(
      /^\//,
      "",
    ) || "default";

  void getOrCreateRoom(roomName).then((room) => {
    handleConnection(ws, req, room);
  });
});

console.log(`Collaboration server running on ws://localhost:${PORT}`);
