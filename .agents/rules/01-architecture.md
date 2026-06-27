---
trigger: always_on
---

# Monorepo Architecture & Clean Code Rules

This project is a distributed, collaborative text editor utilizing a split backend (stateless API vs. stateful WebSocket Sync) and a rich client workspace. Strict boundary isolation is critical to prevent code bleeding and state desynchronization.

---

## 1. Monorepo Package Boundaries & Core Flow

```text
       ┌────────────────────────┐
       │   packages/client      │
       └─────┬────────────┬─────┘
             │ (HTTP REST)│ (WebSockets)
             ▼            ▼
┌──────────────────┐    ┌──────────────────┐
│  api-server      │    │  sync-server     │
│  (Spring Boot)   │◄───│  (Node.js/TS)    │
└──────────────────┘    └──────────────────┘
       (Shared State via Room Slugs / Tokens)

```

### Invariants

- **No Direct Package Cross-Imports:** Files in `packages/client` and `packages/sync-server` share TypeScript environments but must NEVER cross-import source files directly. Any shared logic must be explicitly extracted into a shared package or duplicated cleanly if boundaries require physical isolation.

- **Polyglot Schema Sync:** API changes affecting authentication, room metadata, or snapshot structures must be synchronized simultaneously across the Java Spring Boot models, the Sync-Server types, and the Client API definitions.

## 2. Package-Specific Architecture Patterns

### A. Client (`packages/client`) — Clean View-Model Separation

- **Strict Layer Isolation:** `core` ◀── `editor` ◀── `view` ◀── `ui`. The core document state engines must have ZERO knowledge of React components or styling libraries.

- **State Externalization:** Complex operational state (e.g., cursor math, selection tracking, Yjs undo managers) must reside in the `ViewModel` or dedicated hooks, leaving React components to act as pure, predictable presentation layers.

### B. API Server (`packages/api-server`) — Stateless Clean Architecture

- **Layer Separation:** `Entity` ◀── `Repository` ◀── `Service` ◀── `Controller`.

- **Stateless Enforcement:** The API server must remain strictly stateless. It manages relational persistence (PostgreSQL), migrations, room discovery, and long-term snapshot data. It must never hold active real-time socket connections.

- **Validation Isolation:** HTTP Request payloads must use strict JSR-380 validation annotations (`@NotNull`, `@Size`, etc.) at the Controller entry point before hitting any business services.

### C. Sync Server (`packages/sync-server`) — Stateful Real-time Processing

- **Event-Driven Architecture:** The sync server is built on a modular, event-driven architecture using an internal `EventBus` (`infra/eventBus`). Modules must remain loosely coupled and communicate exclusively by emitting and listening to strongly typed events (e.g., `CLIENT_CONNECTED`) rather than direct method calls between domains.

- **Operational Boundaries:** This server is solely responsible for low-latency operational sync (Yjs CRDT updates) and active presence awareness.

- **Decoupled Persistence:** It must offload persistence workloads asynchronously (via standard scheduled tasks or event loops) to the `api-server` to keep the main event loop non-blocking.

## 3. Collaborative State & Data Invariants

- **CRDT Integrity:** Real-time state conflict resolution must rely fully on deterministic algorithms (Yjs). Custom state mutations that bypass or override the collaborative text document structure without broadcasting proper updates are strictly prohibited.

- **Single Source of Truth (SSOT):**

  - Room metadata (creator, access rules, tokens) SSOT = `api-server`.

  - Ephemeral cursor/presence positions SSOT = `sync-server` internal state.

  - Document text buffer content SSOT = Yjs text type synchronized over WebSockets.

## 4. Modularity & Extendability Rules

- **Interface-Driven Design:** New systemic capabilities (e.g., storage engines, token verifiers, layout managers) must be defined via explicit contracts (Interfaces/Abstract Classes) before implementation.

- **Co-location Rule:** Place types, DTOs, custom exception schemas, and utility helper files inside the specific domain module directory (`auth/`, `room/`, `snapshot/`) where they are primarily consumed rather than standardizing on unstructured global directories.
