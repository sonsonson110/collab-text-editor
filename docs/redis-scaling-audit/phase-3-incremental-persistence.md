# Phase 3: Incremental Update Persistence

> **Status: ✅ Implemented**
> See `packages/sync-server/src/snapshot/` for `deltaScheduler.ts`, `compactionWorker.ts`, and `presenceCounter.ts`.

## Overview
Currently, the `sync-server` runs a `snapshotScheduler` that debounces saves. When a save triggers, the entire `Y.Doc` is serialized into a binary state update and sent to the `api-server` via HTTP PUT, overwriting the row in PostgreSQL.
As the document grows, sending and writing the full binary blob becomes expensive and scales poorly with high edit frequencies.

This phase refactors persistence to use an append-only log of Yjs deltas, moving the heavy compaction work to the background.

## Proposed Architecture
- **Append-Only Delta Log**: Instead of saving full snapshots, the `sync-server` will push incremental `Yjs` updates to a persistent log (e.g., a Redis Stream `room:updates:<roomId>` or an append-only Postgres table).
- **Background Compaction**: A background worker (could be a scheduled job in `api-server`) periodically consumes the updates log, applies the deltas to the last known full snapshot, generates a new compacted snapshot, and clears the applied deltas.
- **Teardown Strategy**: Final snapshots on room teardown become a final compaction job rather than an immediate full state encode.

## Audit & Implementation Details

### 1. Removing `snapshotScheduler`
- Remove the debounced `PUT /api/internal/rooms/:id/snapshot` logic.
- Replace it with logic that intercepts `doc.on('update')`. Instead of a 5s debounce of the *full* doc, buffer the raw update buffers and push them to Redis Streams (`XADD room:updates:<roomId>`) periodically (e.g., every 1 second).

### 2. Distributed Teardown (The "Last Client" Edge Case)
- **The Problem**: With multiple horizontally scaled `sync-server` nodes, Node A cannot know if the client disconnecting is the *global* last client, because Node B might still have active connections for the same room.
- **The Solution (Distributed Presence Counter)**:
  - Maintain a Redis key: `room:connections:<roomId>` as an integer.
  - On WebSocket connect: `INCR room:connections:<roomId>`.
  - On WebSocket disconnect: `DECR room:connections:<roomId>`.
  - When a `DECR` operation returns `0`, that node knows the room is globally empty.
- **Node Crashes (Zombie connections)**:
  - If a `sync-server` node crashes hard, it won't fire `DECR`. The connection count will permanently stay > 0, preventing compaction and causing memory leaks.
  - *Mitigation*: Nodes should maintain a heartbeat per connection (or per room) with a TTL in Redis. Alternatively, the compaction worker can scan for "stale" rooms in Redis Streams that have had no new updates for X minutes and trigger compaction anyway, regardless of the connection counter.

### 3. Background Compaction Worker
- Build a service (either in Java `api-server` using a Yjs Java port if one exists, or a dedicated Node.js worker) that:
  1. Reads from `room:updates:<roomId>`
  2. Applies deltas to the base snapshot in Postgres.
  3. Saves the new snapshot.
  4. Trims the Redis Stream (`XTRIM`).

## Advantages
- **Write Performance**: Pushing small deltas to Redis Streams is orders of magnitude faster than serializing and HTTP PUTting a full 1MB+ document every 5 seconds.
- **Crash Resilience**: Because updates are appended continuously (e.g., every 1s), data loss on node crash is minimal.

## Risks & Mitigations
- **Compaction Complexity**: Writing the compaction worker requires a Node.js runtime if we rely on the official `yjs` library (since Spring Boot is Java and Java Yjs ports might be immature). This strongly hints at requiring a dedicated sync service/worker (Phase 4).
