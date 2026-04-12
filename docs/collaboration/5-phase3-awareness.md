# Phase 3 — Awareness (Remote Cursors and Presence)

## Objective

Show **where other users are** in the document — their cursor positions, selections, and identity — using the Yjs awareness protocol.

After this phase, each connected client will see colored cursors and labels for every other active user.

---

## Mental Model

```
Awareness ≠ Document

Document:   the shared text content (Y.Text, synced via CRDT)
Awareness:  ephemeral user state — cursor position, name, color
            NOT persisted. Lost when user disconnects. That's intentional.
```

```
┌──────────────────────────────────┐
│         User A's Awareness       │
│  {                               │
│    cursor: { anchor: 5, head: 5 }│
│    user: { name: "Alice", color: "#ff6b6b" }
│  }                               │
└──────────────────────────────────┘
         ↕  broadcasted via WebSocket
┌──────────────────────────────────┐
│         User B's Awareness       │
│  {                               │
│    cursor: { anchor: 12, head: 18 }│
│    user: { name: "Bob", color: "#4ecdc4" }
│  }                               │
└──────────────────────────────────┘
```

---

## How Yjs Awareness Works

The awareness protocol is built into `y-websocket`. Each client has an `awareness` instance:

```ts
const provider = new WebsocketProvider('ws://localhost:1234', 'room', ydoc);
const awareness = provider.awareness;

// Set local state
awareness.setLocalStateField('cursor', {
  anchor: Y.createRelativePositionFromTypeIndex(ytext, 5),
  head: Y.createRelativePositionFromTypeIndex(ytext, 5),
});

awareness.setLocalStateField('user', {
  name: 'Alice',
  color: '#ff6b6b',
});

// Listen for ALL awareness changes (local + remote)
awareness.on('change', () => {
  const states = awareness.getStates();
  // states: Map<clientID, { cursor, user, ... }>
});
```

Key properties:
- `setLocalStateField` updates only the local client's state
- Changes are automatically broadcast to all peers
- When a client disconnects, their awareness state is removed after a timeout
- Awareness state is **not** persisted — it's ephemeral

---

## Step 1 — Define Awareness State Shape

Create: `packages/client/src/collaboration/awareness.ts`

```ts
import * as Y from 'yjs';

export interface UserInfo {
  name: string;
  color: string;
}

export interface CursorState {
  anchor: Y.RelativePosition;
  head: Y.RelativePosition;
}

export interface AwarenessUserState {
  user: UserInfo;
  cursor: CursorState | null;
}
```

---

## Step 2 — Broadcast Local Cursor on Every Change

After every `EditorState.execute()` that moves the cursor, broadcast the new position:

```ts
function broadcastCursor(
  awareness: Awareness,
  ytext: Y.Text,
  cursor: Cursor,
) {
  const doc = ytext.doc!;
  const anchorOffset = /* position to offset */;
  const headOffset = /* position to offset */;

  awareness.setLocalStateField('cursor', {
    anchor: Y.createRelativePositionFromTypeIndex(ytext, anchorOffset),
    head: Y.createRelativePositionFromTypeIndex(ytext, headOffset),
  });
}
```

### Why Relative Positions?

Absolute offsets become invalid when the document changes. `Y.RelativePosition` points to a location **relative to the CRDT structure** — it survives insertions and deletions.

When resolving for display:

```ts
const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
if (absPos) {
  const offset = absPos.index;
  // Convert offset → Position using CollaborativeDocument.getPositionAt(offset)
}
```

---

## Step 3 — Receive Remote Cursors

Subscribe to awareness changes and extract remote cursor positions:

```ts
awareness.on('change', () => {
  const states = awareness.getStates();
  const remoteCursors: RemoteCursor[] = [];

  states.forEach((state, clientID) => {
    if (clientID === ydoc.clientID) return; // skip self

    if (state.cursor && state.user) {
      const anchorAbs = Y.createAbsolutePositionFromRelativePosition(
        state.cursor.anchor, ydoc
      );
      const headAbs = Y.createAbsolutePositionFromRelativePosition(
        state.cursor.head, ydoc
      );

      if (anchorAbs && headAbs) {
        remoteCursors.push({
          clientID,
          user: state.user,
          anchorOffset: anchorAbs.index,
          headOffset: headAbs.index,
        });
      }
    }
  });

  // Update React state with remoteCursors
  setRemoteCursors(remoteCursors);
});
```

---

## Step 4 — Convert Remote Offsets to Viewport Positions

Remote cursors arrive as offsets. To render them, convert to `{line, column}`:

```ts
interface RemoteCursorView {
  clientID: number;
  user: UserInfo;
  anchor: { line: number; column: number };
  head: { line: number; column: number };
}
```

Using the document:

```ts
const anchorPos = document.getPositionAt(anchorOffset);
const headPos = document.getPositionAt(headOffset);
```

Then convert to viewport-relative coordinates using `ViewModel.getViewportStart()`.

---

## Step 5 — Assign User Identity

On first connection, each client needs a name and color. For a learning project, random assignment is fine:

```ts
const COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#ffeaa7', '#dfe6e9', '#fd79a8', '#6c5ce7',
];

const name = `User ${Math.floor(Math.random() * 1000)}`;
const color = COLORS[Math.floor(Math.random() * COLORS.length)];

awareness.setLocalStateField('user', { name, color });
```

Later (Phase 5) this could be a login system, but for now random is fine.

---

## Step 6 — Handle Cursor Stability (Required Now)

With real-time collaboration active, cursor stability from Phase 1 (Step 6) must be implemented.

When a remote change arrives:
1. Save the local cursor as a `Y.RelativePosition`
2. After the remote change is applied, resolve back to absolute
3. Update the local cursor

```ts
// In CollaborativeDocument's observer:
yText.observe((event) => {
  if (event.transaction.origin !== 'local') {
    // Remote change — need to adjust local cursor
    this.onRemoteChange?.(event);
  }
});
```

`EditorState` handles cursor adjustment:

```ts
// After remote change notification
const currentOffset = this.document.getOffsetAt(this.cursor.active);
const relPos = Y.createRelativePositionFromTypeIndex(ytext, currentOffset);

// ... remote change applied ...

const newAbs = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
if (newAbs) {
  const newPos = this.document.getPositionAt(newAbs.index);
  this.cursor = this.cursor.moveTo(newPos);
}
```

---

## Step 7 — Replace HistoryManager with Y.UndoManager

Now that real collaboration is active, the current `HistoryManager` must be replaced:

```ts
import { UndoManager } from 'yjs';

const undoManager = new UndoManager(ytext, {
  trackedOrigins: new Set(['local']),  // only undo local operations
});

// Undo
undoManager.undo();

// Redo
undoManager.redo();
```

`Y.UndoManager` automatically:
- Tracks operations by origin (only undoes local changes)
- Transforms undo operations against concurrent remote changes
- Groups rapid edits into single undo steps (configurable via `captureTimeout`)

### Integration with EditorState

Create an interface for undo/redo:

```ts
interface IUndoRedoManager {
  undo(): void;
  redo(): void;
  clear(): void;
}
```

Both `HistoryManager` and a `YjsUndoManager` wrapper implement this. `EditorState` accepts it via constructor injection.

---

## Phase 3 Milestone Checklist

```
[ ] AwarenessState type defined
[ ] Local cursor broadcast on every cursor change
[ ] Remote cursor positions received via awareness listener
[ ] Remote cursors converted to viewport-relative positions
[ ] User identity (name + color) assigned on connection
[ ] Cursor position stability on remote changes (Y.RelativePosition)
[ ] Y.UndoManager integrated, replacing HistoryManager in collab mode
[ ] Unit test: cursor survives remote insertion before it
[ ] Unit test: undo only reverses local changes
```

---

## New Files

```
packages/client/src/collaboration/awareness.ts        [NEW]  — types + cursor broadcast helpers
packages/client/src/collaboration/yjsUndoManager.ts   [NEW]  — wrapper around Y.UndoManager
```

## Modified Files

```
packages/client/src/editor/editorState.ts    ← IUndoRedoManager injection
packages/client/src/App.tsx                  ← awareness setup
```

---

## Next

```
Phase 4 — Collaboration UI
```
