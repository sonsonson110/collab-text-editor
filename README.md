# Educational Text Editor

A monorepo for building a text editor from scratch — for learning purposes.

Live demo: <https://collab-text-editor.pson02.io.vn/>
> Server might only be available around 9 PM – 11 PM (GMT+7) — it's a VM running on a laptop.

## Packages

| Package | Description |
|---|---|
| [`@myapp/client`](./packages/client) | Vite + React editor frontend |
| [`@myapp/sync-server`](./packages/sync-server) | Collaboration server (Yjs WebSocket) |
| [`api-server`](./packages/api-server) | Spring Boot REST API (auth, room management) |

## Getting Started

### Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Backend (API Server)**:
   The Spring Boot backend uses Docker Compose integration to automatically start PostgreSQL. Run the following in the `packages/api-server` directory:
   ```bash
   ./mvnw spring-boot:run
   ```

3. **Run Client & Sync Server**:
   You can start both concurrently from the root directory:
   ```bash
   npm run dev:all
   ```
   Or run them individually:
   ```bash
   npm run dev              # Starts the React client
   npm run dev:sync-server  # Starts the collaboration WebSocket server
   ```

4. **Testing & Linting**:
   ```bash
   npm run test:run         # Run all unit/component tests across workspaces
   npm run lint             # Lint all workspaces
   ```

5. **API Integration Testing (Hurl)**:
   The API integration tests use [Hurl](https://hurl.dev) to run E2E flows against the running API server. The target host changes depending on how you run the server:
   - **Local Development** (Spring Boot direct on port `8081`):
     ```bash
     npm run test:api       # Defaults to http://localhost:8081
     ```
   - **Docker Compose** (proxied through Client Nginx on port `8080`):
     ```bash
     API_HOST=http://localhost:8080 npm run test:api
     ```

### Running with Docker Compose

To spin up the entire self-contained stack (PostgreSQL, api-server, sync-server, and client) at once:
```bash
npm run docker:up            # Builds and starts all containers
npm run docker:down          # Stops and removes all containers
```

## Deployment

Pushing to `main` triggers the [GitHub Actions workflow](.github/workflows/deploy.yml) which:

1. Builds both Docker images and publishes them to GitHub Container Registry (GHCR).
2. SSHs into the VM via the Cloudflare Tunnel (`ssh.pson02.io.vn`) and runs a Docker Swarm rolling update.

### GitHub Actions Secrets

All secrets must be set in **Repository Settings → Secrets and Variables → Actions**.

| Secret | Description | Example |
|---|---|---|
| `VITE_WS_URL` | WebSocket URL baked into the client at build time | `wss://collab-text-editor.pson02.io.vn/ws` |
| `VM_SSH_HOST` | Cloudflare SSH hostname for the VM | `ssh.pson02.io.vn` |
| `VM_USER` | SSH username on the VM | `ubuntu` |
| `VM_SSH_KEY` | Private Ed25519 key for CI authentication (generate a dedicated key pair; add the public key to `~/.ssh/authorized_keys` on the VM) | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |
| `APP_JWT_SECRET` | Base64-encoded HMAC-SHA256 secret used to sign JWTs. **Override this in production** by setting the secret here and passing it as an environment variable to the `api-server` container (as `APP_JWT_SECRET`) and `sync-server` container (as `JWT_SECRET`) in the deployment workflow. | `XtVWcilMyRXDU/NTpTCsZp/V5yqM8Cv8BXNwnZ8fFyY=` |

## Documentation

See [`docs/`](./docs) for architecture documentation, collaboration integration guides, and the demo server setup walkthrough.
