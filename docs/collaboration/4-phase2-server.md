# Phase 2 — Collaboration Server

## Objective

Spin up a **WebSocket server** using `y-websocket` so that multiple browser tabs (or machines) can edit the same document in real time.

After this phase, opening two browser tabs will show the same document, and typing in one will appear in the other.

---

## Mental Model

```
┌──────────┐     WebSocket      ┌──────────────────┐     WebSocket      ┌──────────┐
│ Client A │ ◄────────────────► │  y-websocket     │ ◄────────────────► │ Client B │
│          │                    │  Server           │                    │          │
│ Y.Doc    │                    │  (room: "doc-1") │                    │ Y.Doc    │
│ Y.Text   │                    │                  │                    │ Y.Text   │
└──────────┘                    └──────────────────┘                    └──────────┘
```

The server does **not** understand document content. It simply:
1. Receives Yjs binary updates from clients
2. Broadcasts them to all other clients in the same "room"
3. Optionally persists the document state

---

## Step 1 — Install Server Dependencies

The server is a **separate Node.js process**, not part of the Vite dev server.

Create a server directory:

```
server/
  index.ts       ← entry point
  package.json
  tsconfig.json
```

```bash
cd server
npm init -y
npm install y-websocket yjs ws
npm install -D typescript @types/node tsx
```

### Why a separate directory?

The editor client is a Vite + React app. The server is a plain Node.js process. Mixing them in one `package.json` creates dependency confusion (e.g., `ws` is server-only, React is client-only).

---

## Step 2 — Create the Server

### `server/index.ts`

```ts
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const PORT = 1234;
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  // y-websocket handles all Yjs protocol details
  setupWSConnection(ws, req);
});

console.log(`y-websocket server running on ws://localhost:${PORT}`);
```

That's the entire server. `y-websocket` handles:
- Document state synchronization
- Client join/leave
- Awareness protocol (used later for cursors)
- Optional LevelDB persistence

### `server/package.json`

```json
{
  "name": "editor-collab-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx index.ts"
  }
}
```

### Running the server

```bash
cd server
npm run dev
```

---

## Step 3 — Install Client-Side Provider

Back in the main project:

```bash
npm install y-websocket
```

The `y-websocket` package provides `WebsocketProvider` for the client side.

---

## Step 4 — Connect Client to Server

### How WebsocketProvider works

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://localhost:1234',   // server URL
  'my-document-room',     // room name (shared by all editors of the same doc)
  ydoc                    // the Y.Doc to sync
);

const ytext = ydoc.getText('content');
```

When the provider connects:
1. It sends the local `Y.Doc` state to the server
2. The server responds with any state from other clients
3. Both sides merge automatically (CRDT guarantees convergence)
4. From then on, every local `Y.Doc` change is broadcast, and every remote change is applied locally

---

## Step 5 — Update App.tsx

```tsx
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { CollaborativeDocument } from '@/core/document/collaborativeDocument';

function EditorInstance() {
  const viewModelRef = React.useRef<ViewModel | null>(null);
  const providerRef = React.useRef<WebsocketProvider | null>(null);

  if (!viewModelRef.current) {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');

    // Connect to collaboration server
    const provider = new WebsocketProvider(
      'ws://localhost:1234',
      'document-room',
      ydoc
    );
    providerRef.current = provider;

    const doc = new CollaborativeDocument(ytext);
    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    viewModelRef.current = new ViewModel(editorState);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
    };
  }, []);

  return <EditorView viewModel={viewModelRef.current} />;
}
```

---

## Step 6 — Handle Initial Document Content

When the first client connects to a new room, the `Y.Text` is empty. We need to initialize it with `INITIAL_TEXT` only once.

```ts
provider.on('sync', (synced: boolean) => {
  if (synced && ytext.toString() === '') {
    // First client to join — seed the document
    ytext.insert(0, INITIAL_TEXT);
  }
});
```

The `sync` event fires once the client has received all existing state from the server. If the text is still empty after sync, this client is the first one — so it seeds the document.

---

## Step 7 — Connection State UI

Users need feedback about connection status. Add a simple indicator:

```
🟢 Connected       — WebSocket is open, syncing
🟡 Connecting...   — Attempting to connect
🔴 Disconnected    — Server is down or unreachable
```

The provider emits status events:

```ts
provider.on('status', ({ status }: { status: string }) => {
  // status: 'connecting' | 'connected' | 'disconnected'
  setConnectionStatus(status);
});
```

This is a small UI addition — a colored dot in the corner.

---

## Step 8 — Server Persistence (Optional)

By default, `y-websocket` keeps documents **in memory only**. When the server restarts, all documents are lost.

For persistence, `y-websocket` supports LevelDB:

```bash
cd server
npm install level
```

Start with persistence:

```ts
const PERSISTENCE_DIR = './yjs-docs';

// y-websocket auto-detects LevelDB if YPERSISTENCE env var is set
process.env.YPERSISTENCE = PERSISTENCE_DIR;
```

Or configure it programmatically. This is optional for a learning project.

---

## Understanding the Sync Protocol

What happens over the WebSocket wire:

```
1. Client connects
2. Client sends:  SyncStep1 (its state vector — what it knows)
3. Server sends:  SyncStep2 (the diff — what client is missing)
4. Server sends:  SyncStep1 (the server's state vector)
5. Client sends:  SyncStep2 (the diff — what server is missing)
6. Both are now in sync.
7. From now on: any local change → client sends Update → server broadcasts to all others
```

The Yjs sync protocol is a two-phase handshake. State vectors are compact summaries of "what I have seen." Updates contain only the missing pieces.

This is efficient — reconnecting after being offline only transfers the changes that happened while offline, not the entire document.

---

## Development Workflow

During development, run both processes:

**Terminal 1 — Server:**
```bash
cd server
npm run dev
```

**Terminal 2 — Client:**
```bash
npm run dev
```

Open `http://localhost:5173` in two browser tabs. Type in one — see it in the other.

---

## Phase 2 Milestone Checklist

```
[ ] server/ directory created with its own package.json
[ ] y-websocket server runs on port 1234
[ ] y-websocket installed as client dependency
[ ] WebsocketProvider wired in App.tsx
[ ] Document syncs between two browser tabs
[ ] Initial content seeded on first connection
[ ] Connection status indicator (optional but recommended)
[ ] Server shutdown/restart does not crash clients (they reconnect)
[ ] Provider cleanup on component unmount
```

---

## New Files

```
server/index.ts           [NEW]
server/package.json        [NEW]
server/tsconfig.json       [NEW]
```

## Modified Files

```
src/App.tsx                ← WebsocketProvider wiring
package.json               ← add y-websocket dependency
```

---

## What NOT to do in Phase 2

- ❌ Implement remote cursors (Phase 3)
- ❌ Add user authentication or permissions
- ❌ Build a room selection UI
- ❌ Set up production deployment

Focus: **Two tabs, same document, real-time sync.**

---

## Next

```
Phase 3 — Awareness (Remote Cursors and Presence)
```
