# Phase 2: Shared Room State via Redis

## Overview
Currently, each `sync-server` node keeps a single in-memory `Y.Doc` per active room. If multiple `sync-server` instances are deployed (behind a load balancer), two users in the same room might be routed to different nodes. Because the `Y.Doc` state is isolated per node, they would not see each other's cursor movements or text changes.

This phase introduces Redis as a shared state layer so that multiple `sync-server` nodes can cooperatively host the same collaborative room.

## Proposed Architecture
- **Room Initialization (Caching)**: Instead of hitting PostgreSQL (via `api-server`) every time a node needs to load a room, the `sync-server` will first attempt to fetch the Yjs binary snapshot from Redis. If it misses, it falls back to the `api-server` (PostgreSQL), and then caches the result in Redis.
- **Cross-Node Sync (Fan-out)**: Create a Redis Pub/Sub channel per room: `room:sync:<roomId>`. All nodes hosting connections for `<roomId>` will subscribe to this channel.

## Audit & Implementation Details

### 1. Cross-Node Update Fan-out
- When Node A receives a `MSG_SYNC` (Update) or `MSG_AWARENESS` from a client:
  - It applies it locally to its in-memory `Y.Doc` / `Awareness`.
  - It publishes the raw update buffer to the Redis channel `room:sync:<roomId>`.
- When Node B (subscribed to `room:sync:<roomId>`) receives the buffer:
  - It applies the update to its local `Y.Doc` / `Awareness`.
  - It broadcasts the update to all local WebSockets connected to that room.
- *Crucial Detail*: Nodes must prevent infinite echo loops. When Node A publishes an update, it will also receive it back from Redis. We need to attach a `nodeId` (or sender identifier) to the Redis payload so nodes can ignore their own published messages.

### 2. Room Initialization & Fallback
- In `getOrCreateRoom(name)` (in `src/index.ts`):
  1. Check Redis `GET room:state:<roomId>`.
  2. If found, hydrate `Y.Doc` from the Redis buffer.
  3. If not found, HTTP GET to `api-server` -> hydrate -> `SET room:state:<roomId>` in Redis.
- **Race Condition**: If two nodes attempt to initialize a room simultaneously, they both might hit Postgres. 
  - *Mitigation*: This is acceptable for read-only hydration, but we could use Redis distributed locks (Redlock) or simple `SETNX` to designate one node as the initiator.

## Advantages
- **True Horizontal Scaling**: WebSockets can be balanced across any number of `sync-server` nodes. Clients will remain synchronized regardless of which node they connect to.
- **Reduced DB Load**: Hot rooms are loaded directly from Redis, vastly reducing the `GET /api/internal/rooms/:id/snapshot` traffic to the Spring Boot server.

## Risks & Mitigations
- **Yjs State Divergence**: If nodes miss Redis messages (due to Pub/Sub ephemeral nature), their local `Y.Doc`s will diverge. When a user edits, the diverging vectors will eventually cause issues.
  - *Mitigation*: Periodically (e.g., every 30 seconds), nodes can exchange their Yjs State Vectors via a `SyncStep1` over Redis, forcing a reconciliation if they fell out of sync.
