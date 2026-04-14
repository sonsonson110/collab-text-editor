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
 */

import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { IncomingMessage } from "node:http";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(name: string): Room {
  const existing = rooms.get(name);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const room: Room = { doc, awareness, connections: new Set() };

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

  rooms.set(name, room);
  return room;
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  // Room name comes from the URL path: ws://host:port/my-room → "my-room"
  const roomName = (req.url ?? "/").replace(/^\//, "") || "default";
  const room = getOrCreateRoom(roomName);
  room.connections.add(ws);

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
  ws.on("close", () => {
    room.connections.delete(ws);
    // Remove the disconnected client's awareness state so other clients stop
    // rendering their cursor.
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [room.doc.clientID],
      null,
    );
    // Tear down empty rooms to free memory.
    if (room.connections.size === 0) {
      room.awareness.destroy();
      rooms.delete(roomName);
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
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", handleConnection);

console.log(`Collaboration server running on ws://localhost:${PORT}`);
