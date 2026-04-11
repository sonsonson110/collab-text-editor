# Phase 5 — Extensions Roadmap

## Objective

Document the **future extension points** — features that can be built on top of the collaboration foundation without redesigning the core architecture.

These are not planned for immediate implementation. They exist as a roadmap for when the foundation is solid and exploration is desired.

---

## Extension 1 — Offline Support

### Concept

Yjs CRDTs work offline by design. Every client carries a full copy of the document. Edits made offline are stored locally and merged when the connection is restored.

### Implementation path

1. Use `y-indexeddb` to persist `Y.Doc` state in the browser's IndexedDB
2. When offline, edits continue to work (they modify the local CRDT)
3. When reconnected, `WebsocketProvider` automatically syncs the diff
4. The sync protocol ensures convergence even after extended offline periods

### Install

```bash
npm install y-indexeddb
```

### Usage

```ts
import { IndexeddbPersistence } from 'y-indexeddb';

const persistence = new IndexeddbPersistence('document-room', ydoc);
persistence.on('synced', () => {
  console.log('Local IndexedDB loaded');
});
```

### Considerations

- Conflict resolution after offline periods may produce unexpected text arrangements (CRDT guarantees convergence, not "correctness")
- UI should indicate when the client is offline and has unsynchronized changes

---

## Extension 2 — Room Management

### Concept

Instead of a single hardcoded room, allow users to create, join, and switch between document rooms.

### Implementation path

1. Server maintains a list of active rooms
2. REST API endpoint: `GET /rooms` returns active rooms
3. Client-side room picker UI: list of rooms + "Create New" button
4. WebsocketProvider is instantiated with the selected room name
5. Switching rooms = destroy old provider + create new one

### URL routing

```
/edit/:roomId  →  join room by ID
/               →  show room picker
```

Use a simple hash-based router (no framework needed):

```ts
const roomId = window.location.hash.slice(1) || 'default';
```

---

## Extension 3 — User Authentication

### Concept

Replace random user names with real identity — login, persistent names, and optionally access control.

### Implementation path (simple)

1. Prompt for username on first visit, store in `localStorage`
2. Use the stored name in awareness state

### Implementation path (advanced)

1. Auth provider (e.g., firebase auth, OAuth)
2. Server validates WebSocket connections with JWT tokens
3. Room access permissions: owner, editor, viewer roles

---

## Extension 4 — Permissions and Read-Only Mode

### Concept

Not all users should be able to edit. A "viewer" role can see the document and cursors but cannot modify text.

### Implementation path

1. Server assigns roles per room per user
2. Client-side: disable keyboard/mouse input handlers when role = viewer
3. The Yjs document is still synced (viewers see real-time changes), but the local client does not create mutations

### EditorView change

```ts
const isReadOnly = role === 'viewer';

const handleKeyDown = isReadOnly ? undefined : (e) => { ... };
const handleMouseDown = isReadOnly ? undefined : (e) => { ... };
```

---

## Extension 5 — Incremental LineIndex Updates

### Concept

Currently, `LineIndex.rebuild(text)` does a full O(n) scan of the entire document on every change. For large documents with many concurrent changes, this is wasteful.

### Implementation path

Use the Yjs delta from `Y.Text.observe()` to update `lineStarts` incrementally:

```ts
yText.observe((event) => {
  for (const delta of event.delta) {
    if (delta.retain) {
      // skip forward
    } else if (delta.insert) {
      // count newlines in inserted text
      // insert new entries in lineStarts
    } else if (delta.delete) {
      // count newlines in deleted range
      // remove entries from lineStarts
    }
  }
});
```

This transforms LineIndex updates from O(n) to O(delta_size).

---

## Extension 6 — WebRTC Transport

### Concept

Replace or supplement the WebSocket server with **peer-to-peer** connections using WebRTC. This eliminates the central server for document sync (though a signaling server is still needed).

### Implementation path

```bash
npm install y-webrtc
```

```ts
import { WebrtcProvider } from 'y-webrtc';

const provider = new WebrtcProvider('room-name', ydoc, {
  signaling: ['wss://signaling.example.com'],
});
```

### Trade-offs

| | WebSocket | WebRTC |
|---|---|---|
| Server required | Yes | Only for signaling |
| Latency | Low | Very low (direct) |
| NAT traversal | N/A | Needs STUN/TURN |
| Scalability | Good | Limited by mesh |
| Persistence | Server-side | Must be separate |

---

## Extension 7 — Document Version History

### Concept

Store snapshots of the document at regular intervals. Allow users to browse and restore previous versions.

### Implementation path

1. Server periodically snapshots `Y.Doc` state using `Y.encodeStateAsUpdate(ydoc)`
2. Store snapshots in a database (or filesystem) with timestamps
3. Client-side UI: timeline slider showing historical states
4. Restore: apply snapshot to a new `Y.Doc`, compare with current, show diff

### Using Yjs snapshots

```ts
const snapshot = Y.snapshot(ydoc);
// Later:
const restoredDoc = Y.createDocFromSnapshot(ydoc, snapshot);
```

---

## Extension 8 — Conflict Annotations

### Concept

When two users edit the same line simultaneously, the CRDT merges deterministically but the result may not be what either user intended. An advanced feature would highlight "conflict regions" where concurrent edits overlapped.

### Implementation path

1. Track concurrent edits (operations from different clients affecting overlapping ranges within a time window)
2. Annotate the affected text regions with a visual indicator
3. Allow users to click "accept" to dismiss the annotation

This is an advanced UX feature — not necessary for learning purposes but interesting to explore.

---

## Architecture After All Extensions

```
src/
  core/
    document/
      document.ts                ← solo mode
      collaborativeDocument.ts   ← Y.Text backed
    lines/
      lineIndex.ts               ← incremental update support
    position/
  editor/
    editorState.ts               ← IUndoRedoManager injection
    commands.ts
    cursor/
    history.ts                   ← solo mode undo
  collaboration/
    awareness.ts                 ← awareness types + helpers
    yjsUndoManager.ts           ← Y.UndoManager wrapper
    provider.ts                  ← WebSocket / WebRTC provider setup
    roomManager.ts               ← room listing + switching
  view/
    viewModel.ts
  ui/
    EditorView.tsx
    components/
      RemoteCursor.tsx
      RemoteSelection.tsx
      UserPresenceBar.tsx
      RoomPicker.tsx
      VersionHistory.tsx
server/
  index.ts                       ← y-websocket server
  auth.ts                        ← optional authentication
  persistence.ts                 ← optional document persistence
```

---

## Summary of Extension Dependencies

```
Phase 1 (Yjs Core)
  └── Phase 2 (Server)
        ├── Phase 3 (Awareness)
        │     └── Phase 4 (UI)
        │
        ├── Extension 1 (Offline)      ← independent of Phase 3/4
        ├── Extension 2 (Rooms)        ← independent of Phase 3/4
        ├── Extension 3 (Auth)         ← requires Extension 2
        ├── Extension 4 (Permissions)  ← requires Extension 3
        └── Extension 6 (WebRTC)       ← alternative to Phase 2

Extension 5 (Incremental LineIndex) ← independent, can be done anytime
Extension 7 (Version History)       ← requires Phase 2 server
Extension 8 (Conflict Annotations)  ← requires Phase 3 awareness
```

---

## Closing

The collaboration foundation (Phases 1–4) provides everything needed for a functional real-time collaborative editor. Each extension is a self-contained addition that builds on the foundation without requiring architectural changes.

The most important principle throughout: **the collaboration layer wraps the editor — it does not invade it.** The editor must always work in solo mode. Collaboration is opt-in, additive, and modular.
