# Phase 2 — Collaboration Server

## Objective

Spin up a **WebSocket server** using `y-websocket` so that multiple browser tabs (or machines) can edit the same document in real time.

After this phase, opening two browser tabs will show the same document, and typing in one will appear in the other.

---

## Mental Model

```
┌──────────┐     WebSocket      ┌──────────────────┐     WebSocket      ┌──────────┐
│ Client A │ ◄────────────────► │  y-websocket     │ ◄────────────────► │ Client B │
│          │                    │  Server          │                    │          │
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
packages/server/
  index.ts       ← entry point
  package.json
  tsconfig.json
```

```bash
cd packages/server
npm init -y
npm install yjs ws lib0 y-protocols
npm install -D typescript @types/node @types/ws tsx
```

### Why a separate directory?

The editor client is a Vite + React app. The server is a plain Node.js process. Mixing them in one `package.json` creates dependency confusion (e.g., `ws` is server-only, React is client-only).

---

## Step 2 — Create the Server

### `packages/server/src/index.ts`

> **Note**: `y-websocket` version 3 removed its server-side utilities. We must implement the WebSocket handling directly using `ws` and the official `y-protocols` packages, which completely decouples the server implementation from the client.

```ts
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// ... Standard Yjs room/connection pooling boilerplate omitted.
// (See the repository implementation for full sync logic).

const PORT = 1234;
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  // Handshake and listen for msgTypes 0 (sync) and 1 (awareness) manually
  // using lib0 encoding/decoding and y-protocols handlers.
});

console.log(`Collaboration server running on ws://localhost:${PORT}`);
```

The custom `y-protocols` server handles:

- Document state synchronization (`y-protocols/sync`)
- Broadcast routing to connected peers (filtering out the sender)
- Awareness tracking for cursors and presence (`y-protocols/awareness`)
- Empty room teardown to manage Node memory resources
- Optional LevelDB persistence

### `packages/server/package.json`

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
cd packages/server
npm run dev
```

---

## Step 3 — Install Client-Side Provider

Back in the client package (`packages/client`):

```bash
cd packages/client
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
import { useState, useEffect } from 'react';

function EditorInstance() {
  const [viewModel, setViewModel] = useState<ViewModel | null>(null);

  // Initialize the collaborative setup inside useEffect to gracefully handle
  // React 18 Strict Mode double-mounts.
  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');

    // Connect to collaboration server
    const provider = new WebsocketProvider(
      'ws://localhost:1234',
      'document-room',
      ydoc
    );

    const doc = new CollaborativeDocument(ytext);
    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    
    setViewModel(new ViewModel(editorState));

    // Cleanup on unmount gracefully closes the socket connection
    return () => {
      provider.destroy();
    };
  }, []);

  if (!viewModel) return null;

  return <EditorView viewModel={viewModel} />;
}
```

> **Note on React 18 Strict Mode**: 
> In dev mode, React immediately mounts, unmounts, and remounts components. 
> Initializing the provider inside the render phase with `useRef` causes the unmount to destroy the socket while it's still connecting, leaving the remounted component permanently disconnected. Doing it inside `useEffect` ensures the connection is cleanly recreated.

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
cd packages/server
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
npm run dev:server
```

**Terminal 2 — Client:**

```bash
npm run dev
```

Open `http://localhost:5173` in two browser tabs. Type in one — see it in the other.

---

## Phase 2 Milestone Checklist

```
[ ] packages/server/ directory created with its own package.json
[ ] `y-websocket` installed as client-side dependency; direct `ws` + `y-protocols` installed on server
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
packages/server/index.ts           [NEW]
packages/server/package.json        [NEW]
packages/server/tsconfig.json       [NEW]
```

## Modified Files

```
packages/client/src/App.tsx                ← WebsocketProvider wiring
packages/client/package.json               ← add y-websocket dependency
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
