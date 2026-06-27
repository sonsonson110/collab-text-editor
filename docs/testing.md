# Testing

> All testing strategies for the project in one place.

---

## Quick Start

```bash
npm run test:run         # Client unit/component tests (Vitest, all workspaces)
npm run test:api         # API E2E tests (Hurl, against local Spring Boot on :8081)

# Spring Boot integration tests
cd packages/api-server && ./mvnw test
```

---

## 1. Client Unit Tests (Vitest)

### What to Test

```
core/    → test everything. Pure logic, zero deps. Highest value.
editor/  → test commands and cursor transitions against real Document.
view/    → test viewport math against a stubbed IEditorState.
ui/      → do NOT unit test. React components are integration territory.
```

### Test File Placement

Co-located with source — `foo.ts` → `foo.test.ts` in the same directory.

```
packages/client/src/
  core/
    document/document.test.ts, collaborativeDocument.test.ts
    position/position.test.ts, range.test.ts
    lines/lineIndex.test.ts
    utils.test.ts
  editor/
    cursor/cursor.test.ts
    editorState.test.ts, editorState.collab.test.ts
  view/viewModel.test.ts
  ui/utils.test.ts
  hooks/useSoloEditor.test.ts
  auth/tokenStorage.test.ts
```

### Configuration

Vitest reads `vite.config.ts` directly — path aliases (`@/*`) work in tests with zero extra config.

```bash
npm install -D vitest      # already installed
```

### Mocking Approach

- **Core layer**: no mocking needed — all pure value types.
- **Editor layer**: use the real `Document` class (no side effects).
- **View layer**: use a manual `IEditorState` stub (see `viewModel.test.ts`).

---

## 2. Sync Server Unit Tests (Vitest)

### What to Test

The sync-server is built on a modular EventBus architecture.
- **`modules/`**: Unit test individual services (`protocolHandler`, `permissionService`) by passing in a mock `EventBus` and asserting the correct events are emitted or handled.
- **`infra/`**: Test infrastructure wrappers (like `eventBus` or `redisEventBridge`) in isolation.

### Test File Placement

Co-located with source:
```
packages/sync-server/src/
  modules/
    permission/permissionService.test.ts
  infra/
    eventBus.test.ts
```

---

## 3. API Integration Tests (Spring Boot + MockMvc)

### Stack

- `@SpringBootTest` — full application context (no `@WebMvcTest`).
- `@AutoConfigureMockMvc` — injects `MockMvc`.
- `@Transactional` — auto-rollback per test.
- Real PostgreSQL via Docker Compose integration (no H2).

### File Placement

```
packages/api-server/src/test/java/com/collab/api/
  auth/AuthControllerTest.java       ← one class per controller
  room/RoomControllerTest.java
```

### Naming Convention

```
<action>_<condition>_<expectedOutcome>
```

Examples: `register_happyPath_returnsCreatedWithToken`, `createRoom_unauthenticated_returns401`.

### Coverage Per Endpoint

Every controller method must have tests for:

1. **Happy path** — correct status and response.
2. **Validation failure** — `400` with `fieldErrors`.
3. **Auth guard** — `401` without token.
4. **Domain error** — `409` (duplicate), `404` (not found), etc.

---

## 4. API E2E Tests (Hurl)

[Hurl](https://hurl.dev) scripts run full HTTP flows against a live API server.

### File Placement

```
packages/api-server/hurl/
  auth.hurl                          ← per-resource tests
  room.hurl
  flow_basic_room_management.hurl    ← multi-step user journeys
```

### Running

```bash
npm run test:api                              # local dev (port 8081)
API_HOST=http://localhost:8080 npm run test:api  # Docker Compose (Nginx proxy)
```

### Conventions

- Interpolate `{{suffix}}` into test data (emails, names) for idempotent reruns.
- Flow scripts (`flow_*.hurl`) model end-to-end user journeys.
- `--variable suffix=...` is auto-generated with a timestamp by `test-api.sh`.
