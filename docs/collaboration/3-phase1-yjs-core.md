# Phase 1 — Yjs Core Integration

## Objective

Replace the local string-based document with **Y.Text** as the source of truth for text content, while keeping the existing `IDocument` interface stable.

The editor must still work identically in solo mode. The Yjs integration sits behind the same interface.

---

## Mental Model

```
Before (solo):
  Document
    └── this.text: string           ← source of truth
    └── this.lineIndex: LineIndex   ← derived from text

After (collaborative):
  CollaborativeDocument
    └── this.yText: Y.Text          ← source of truth (CRDT)
    └── this.lineIndex: LineIndex    ← derived from yText.toString()
    └── this.observers: Set          ← notified on remote changes
```

The key insight: **Y.Text replaces the string, not the Document interface.**

---

## Step 1 — Install Dependencies

```bash
npm install yjs
```

That's it for Phase 1. The network transport (`y-websocket`) comes in Phase 2.

Yjs is a pure library with zero dependencies. It works entirely in-memory.

---

## Step 2 — Create CollaborativeDocument

Create a new file: `src/core/document/collaborativeDocument.ts`

This class implements `IDocument` but uses `Y.Text` internally instead of a plain string.

### Interface reminder

```ts
interface IDocument {
  getText(): string;
  getLength(): number;
  getLineCount(): number;
  getMaxLineLength(): number;
  insert(position: Position, text: string): void;
  delete(range: Range): void;
  replace(range: Range, newText: string): void;
  getPositionAt(offset: number): Position;
  getOffsetAt(position: Position): number;
  getLineContent(line: number): string;
  getLineLength(line: number): number;
  getTextInRange(range: Range): string;
}
```

### Implementation sketch

```ts
import * as Y from 'yjs';
import { LineIndex } from '@/core/lines/lineIndex';

export class CollaborativeDocument implements IDocument {
  private yText: Y.Text;
  private lineIndex: LineIndex;
  private textSnapshot: string;

  constructor(yText: Y.Text) {
    this.yText = yText;
    this.textSnapshot = yText.toString();
    this.lineIndex = new LineIndex(this.textSnapshot);

    // Listen for ALL changes (local + remote)
    this.yText.observe(() => {
      this.textSnapshot = this.yText.toString();
      this.lineIndex.rebuild(this.textSnapshot);
    });
  }

  getText(): string {
    return this.textSnapshot;
  }

  insert(position: Position, text: string): void {
    const offset = this.getOffsetAt(position);
    this.yText.insert(offset, text);
    // Observer auto-updates textSnapshot + lineIndex
  }

  delete(range: Range): void {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    this.yText.delete(startOffset, endOffset - startOffset);
  }

  replace(range: Range, newText: string): void {
    const startOffset = this.getOffsetAt(range.start);
    const endOffset = this.getOffsetAt(range.end);
    const deleteLength = endOffset - startOffset;
    if (deleteLength > 0) {
      this.yText.delete(startOffset, deleteLength);
    }
    if (newText.length > 0) {
      this.yText.insert(startOffset, newText);
    }
  }

  // ... all read methods delegate to textSnapshot + lineIndex
  //     exactly like the existing Document class
}
```

### Why `textSnapshot`?

`yText.toString()` is not free — it traverses the CRDT internal structure. Caching the result in `textSnapshot` and updating it on every change event avoids repeated traversals during read-heavy operations like `getLineContent()`.

---

## Step 3 — Understand Y.Text Events

When text changes (locally or from a remote peer), `Y.Text.observe()` fires with a `YTextEvent`:

```ts
yText.observe((event: Y.YTextEvent) => {
  event.delta  // array of { insert?: string, delete?: number, retain?: number }
});
```

Example: User types "Hi" at the beginning of a document containing "World":

```
delta: [{ insert: "Hi" }]
result: "HiWorld"
```

Example: User deletes 3 characters starting at offset 2:

```
delta: [{ retain: 2 }, { delete: 3 }]
result: text with chars [2..4] removed
```

For Phase 1, we don't need to parse the delta. We simply:
1. Call `yText.toString()` to snapshot
2. Rebuild the LineIndex
3. Notify listeners

The delta becomes useful later for incremental LineIndex updates (Phase 5 optimization).

---

## Step 4 — Bridge Remote Changes to EditorState

When a **remote** user makes a change, the CollaborativeDocument's observer fires. But `EditorState` also needs to know — so it can notify its own listeners and trigger a UI re-render.

This requires a **change notification** from `CollaborativeDocument` to `EditorState`.

### Option A — EditorState subscribes to CollaborativeDocument

Add a `subscribe(listener)` method to `IDocument`:

```ts
interface IDocument {
  // ... existing methods ...
  subscribe?(listener: () => void): () => void;
}
```

`EditorState` checks if the document supports subscription and wires it up:

```ts
constructor(doc: IDocument, cursor: Cursor) {
  this.document = doc;
  this.cursor = cursor;
  this.history = new HistoryManager();

  // If the document can notify us of external changes, listen
  if (doc.subscribe) {
    doc.subscribe(() => this.notifyListeners());
  }
}
```

### Option B — Observable wrapper

Wrap `CollaborativeDocument` in an observable that EditorState already subscribes to.

**Recommended: Option A.** It's simpler, explicit, and doesn't require additional abstractions.

---

## Step 5 — Handle Local vs Remote Changes

A critical distinction:

| Change Origin | Who applies it | Who should be notified |
|---|---|---|
| **Local** (user types) | `EditorState.execute()` → `document.insert()` | `EditorState` already notifies listeners |
| **Remote** (other user) | Yjs applies it via network sync | Must trigger `EditorState` notification |

The `Y.Text.observe()` callback fires for **both** local and remote changes. To avoid double-notification for local changes:

```ts
this.yText.observe((event) => {
  this.textSnapshot = this.yText.toString();
  this.lineIndex.rebuild(this.textSnapshot);

  // Only notify external listeners for remote changes
  if (event.transaction.origin !== 'local') {
    this.notifyExternalListeners();
  }
});
```

When the local editor makes a change, it wraps it in a transaction with a known origin:

```ts
insert(position: Position, text: string): void {
  const offset = this.getOffsetAt(position);
  this.yText.doc!.transact(() => {
    this.yText.insert(offset, text);
  }, 'local');
}
```

This prevents the observe handler from double-notifying after a local edit (since EditorState already calls `notifyListeners()` at the end of `execute()`).

---

## Step 6 — Cursor Position Stability

When a remote user inserts text **before** the local cursor, the local cursor's Position becomes wrong. The cursor points to a `{line, column}` that now refers to different content.

### Example

```
Document: "Hello World"
Local cursor: Position(0, 6)  →  points to "W"

Remote user inserts "Big " at offset 6:
Document: "Hello Big World"
Local cursor: still Position(0, 6)  →  now points to "B" ← WRONG
```

### Solution: Relative Positions

Yjs provides `Y.RelativePosition` — a cursor position that **survives** insertions and deletions around it:

```ts
// Create a relative position from an absolute offset
const relPos = Y.createRelativePositionFromTypeIndex(yText, 6);

// Later, after remote changes, resolve back to absolute
const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
// absPos.index === 10 (after "Big " was inserted)
```

### Implementation approach

After every remote change event:
1. Convert the current cursor offset to a `Y.RelativePosition` (or maintain one)
2. After the remote change, resolve back to absolute offset
3. Update the cursor via `EditorState`

**For Phase 1:** This can be deferred. In Phase 1, two users will likely not be typing simultaneously (since we haven't set up networking yet). Cursor stability becomes critical in Phase 2+ when real networking is added.

---

## Step 7 — Update App.tsx Wiring

Add a mode toggle or detection:

```tsx
function EditorInstance() {
  const viewModelRef = React.useRef<ViewModel | null>(null);

  if (!viewModelRef.current) {
    // Solo mode (no collaboration)
    const doc = new Document(INITIAL_TEXT);

    // OR: Collaborative mode
    // const ydoc = new Y.Doc();
    // const ytext = ydoc.getText('content');
    // ytext.insert(0, INITIAL_TEXT);
    // const doc = new CollaborativeDocument(ytext);

    const cursor = new Cursor(new Position(0, 0));
    const editorState = new EditorState(doc, cursor);
    viewModelRef.current = new ViewModel(editorState);
  }

  return <EditorView viewModel={viewModelRef.current} />;
}
```

---

## Phase 1 Testing Strategy

Since there's no server yet, test locally using two `Y.Doc` instances connected in-memory:

```ts
import * as Y from 'yjs';

const doc1 = new Y.Doc();
const doc2 = new Y.Doc();
const text1 = doc1.getText('content');
const text2 = doc2.getText('content');

// Simulate sync
doc1.on('update', (update) => Y.applyUpdate(doc2, update));
doc2.on('update', (update) => Y.applyUpdate(doc1, update));

text1.insert(0, 'Hello');
console.log(text2.toString()); // "Hello" — synced!

text2.insert(5, ' World');
console.log(text1.toString()); // "Hello World" — synced!
```

This proves the CRDT merge works without any network.

---

## Phase 1 Milestone Checklist

```
[ ] yjs installed as a dependency
[ ] CollaborativeDocument class created, implements IDocument
[ ] CollaborativeDocument uses Y.Text for all mutations
[ ] CollaborativeDocument caches text snapshot for reads
[ ] CollaborativeDocument notifies listeners on remote changes
[ ] Local vs remote change detection (transaction origin)
[ ] Unit test: two Y.Doc instances syncing via in-memory updates
[ ] Unit test: CollaborativeDocument. insert/delete/replace produce correct text
[ ] App.tsx can switch between solo Document and CollaborativeDocument
[ ] All existing editor tests still pass (solo mode unchanged)
```

---

## New Files

```
src/core/document/collaborativeDocument.ts    [NEW]
src/core/document/collaborativeDocument.test.ts [NEW]
```

## Modified Files

```
src/core/document/document.ts    ← IDocument gains optional subscribe()
src/editor/editorState.ts        ← constructor wires document subscription
src/App.tsx                       ← collaborative wiring option
package.json                      ← add yjs dependency
```

---

## What NOT to do in Phase 1

- ❌ Set up a server (that's Phase 2)
- ❌ Implement remote cursors (that's Phase 3)
- ❌ Replace the undo system (that's a Phase 3+ concern)
- ❌ Optimize LineIndex for incremental updates
- ❌ Add UI for collaboration features

Focus: **Make Y.Text the source of truth, keep everything else working.**

---

## Next

```
Phase 2 — Collaboration Server
```
