# Educational Text Editor

A from-scratch collaborative text editor — built for learning purposes.

Live demo: <https://collab-text-editor.pson02.io.vn/>
> Server availability is limited (~9 PM – 11 PM GMT+7, running on a laptop VM).

---

## Architecture at a Glance

```
Browser (Vite + React)
  core/          → Document, LineIndex, Position, Range
  editor/        → EditorState, Cursor, History
  view/          → ViewModel (viewport math)
  ui/            → EditorView, Components (React)
  collaboration/ → CollaborativeDocument (Y.Text), awareness
       │
       │ WebSocket (Yjs sync + awareness)
       │ Room Ticket JWT (per-room, 5 min TTL)
       ▼
sync-server (Node.js + ws)
  • Modular EventBus architecture
  • Per-room Y.Doc management + snapshot hydration
  • Room Ticket auth at WebSocket upgrade
  • VIEWER write-blocking (drops MSG_SYNC Update sub-type)
  • Incremental delta persistence (Redis Streams)
  • Real-time permission fan-out (Redis Pub/Sub)
       │
       │ HTTP (snapshots) / Redis (events & deltas)
       ▼
api-server (Spring Boot 3)
  • Auth (register / login / guest JWT)
  • Room CRUD + claim flow
  • Room Ticket issuance (GET /by-slug/:slug/ticket)
  • Permission management (access mode, member CRUD)
  • Async permission events via Redis Pub/Sub
  • Snapshot storage (PostgreSQL) & compaction worker
```

See [`docs/architecture.md`](./docs/architecture.md) for the full breakdown.

---

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@myapp/client` | [`packages/client`](./packages/client) | Vite + React editor frontend |
| `@myapp/sync-server` | [`packages/sync-server`](./packages/sync-server) | Collaboration server (Yjs WebSocket) |
| `api-server` | [`packages/api-server`](./packages/api-server) | Spring Boot REST API |

---

## Getting Started

### Local Development

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start the API server** (auto-starts PostgreSQL via Docker Compose integration):

   ```bash
   cd packages/api-server && ./mvnw spring-boot:run
   ```

3. **Start client + sync-server**:

   ```bash
   npm run dev:all
   ```

   Or individually:

   ```bash
   npm run dev              # React client
   npm run dev:sync-server  # Collaboration WebSocket server
   ```

### Docker Compose (Full Stack)

```bash
npm run docker:up      # Build and start all containers (port 8080)
npm run docker:down    # Stop and remove
```

---

## Testing

```bash
npm run test:run       # Client unit tests (Vitest)
npm run lint           # Lint all workspaces
npm run test:api       # API E2E tests (Hurl, against local :8081)
```

Docker Compose target:

```bash
API_HOST=http://localhost:8080 npm run test:api
```

See [`docs/testing.md`](./docs/testing.md) for the full testing guide.

---

## Deployment

Pushing to `main` triggers the [GitHub Actions workflow](.github/workflows/deploy.yml):

1. Builds 3 Docker images → publishes to GHCR.
2. SSHs into the VM via Cloudflare Tunnel → `docker stack deploy` (Swarm rolling update).

### GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `VITE_WS_URL` | WebSocket URL baked into client build |
| `VM_SSH_HOST` | Cloudflare SSH hostname |
| `VM_USER` / `VM_SSH_KEY` | SSH credentials for deployment |
| `APP_JWT_SECRET` | Shared HMAC key (api-server + sync-server) |
| `APP_INTERNAL_API_SECRET` | Shared secret for internal snapshot API |

---

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/architecture.md`](./docs/architecture.md) | System overview, client layer design, sync-server, auth flow, data flow |
| [`docs/api-server.md`](./docs/api-server.md) | REST API endpoints, security model, database schema |
| [`docs/testing.md`](./docs/testing.md) | Vitest, Spring Boot MockMvc, and Hurl testing guides |
| [`docs/demo-server-setup/`](./docs/demo-server-setup/) | VM, Cloudflare Tunnel, and Docker Swarm setup walkthrough |
