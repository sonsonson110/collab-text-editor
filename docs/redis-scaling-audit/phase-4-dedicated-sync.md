# Phase 4: Dedicated Sync Service (Optional)

## Overview
As Phases 1–3 are implemented, the `sync-server` takes on conflicting roles: 
1. **Edge Router**: Managing thousands of WebSocket connections, handling JWT authentication, and routing awareness messages.
2. **State Manager**: Keeping `Y.Doc` instances in memory, merging deltas, and managing background compaction.

If the system scales significantly, having edge nodes perform heavy Yjs merging and snapshot compaction will cause CPU bottlenecks. Phase 4 proposes splitting the `sync-server` into two layers: stateless WebSocket Edge Nodes and a stateful Dedicated Sync/Document Service.

## Proposed Architecture
- **Stateless Edge Nodes**: Horizontally scalable WebSocket servers that do nothing but terminate WebSockets, verify JWTs, and bridge WebSocket frames to Redis Streams/PubSub. They do *not* maintain a `Y.Doc` in memory.
- **Stateful Document Service (Worker)**: A backend pool of Node.js workers that listen to the Redis Streams. They maintain the authoritative `Y.Doc` in memory, handle conflict resolution, broadcast authoritative sync updates, and perform the snapshot compactions (from Phase 3) to Postgres.

## Audit & Implementation Details

### 1. Edge Node Refactoring
- The current `sync-server` is stripped of `Y.Doc` and `Awareness` classes.
- When a client sends a `MSG_SYNC` update, the edge node blindly forwards the raw bytes to the Document Service (via Redis Stream).
- The edge node listens to a Redis Pub/Sub channel for outgoing sync bytes from the Document Service and pushes them down the WebSocket.

### 2. Document Service Responsibilities
- Subscribes to client updates.
- Applies them to a centralized `Y.Doc`.
- Generates standard `y-protocols` sync messages to broadcast back.
- Periodically compacts the `Y.Doc` and writes the binary blob to PostgreSQL (via `api-server` or direct DB connection).

### 3. Auth Boundary for Snapshots
- **Current Flow**: The `sync-server` queries the `api-server` via an internal API using `x-internal-secret`.
- **New Flow**: The stateless Edge Nodes handle the user JWT validation. The Document Service operates purely in a trusted backend zone. It can talk directly to PostgreSQL, or continue using the `api-server` internal API. Since Edge nodes handle auth, the Document Service does not need to know about users, only about `roomIds` and delta streams.

## Advantages
- **Infinite Edge Scaling**: Edge nodes become incredibly cheap to run (high I/O, low CPU). They can be autoscaled independently of document processors.
- **Centralized Conflict Resolution**: By having a single authoritative worker per room (managed via Redis consumer groups or consistent hashing), we avoid the "split-brain" risks of Phase 2 where multiple edge nodes maintain divergent `Y.Doc` instances.
- **Dedicated Compaction**: Compaction (CPU heavy) is removed from the critical path of the real-time WebSocket event loop.

## Risks & Mitigations
- **Complexity**: This adds a significant distributed systems tax (service discovery, consistent hashing for room affinity, worker crash recovery).
- **Latency**: Adding a hop (Client -> Edge -> Redis -> Worker -> Redis -> Edge -> Client) increases the end-to-end latency of a keystroke appearing on a peer's screen.
  - *Mitigation*: Ensure Edge nodes, Redis, and Workers are deployed within the same VPC/subnet to keep network latency under 1-2ms.
