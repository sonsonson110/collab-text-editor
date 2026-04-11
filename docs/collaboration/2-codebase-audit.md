# Codebase Audit — Collaboration Readiness

## Objective

Review every layer of the current editor to identify what must change, what can stay, and what risks exist before integrating Yjs.

---

## Current Architecture Summary

```
src/
  core/
    document/
      document.ts       ← Document class: single string + LineIndex
      change.ts         ← Change type: { range, insertedText }
    lines/
      lineIndex.ts      ← LineIndex: line-start offset array, rebuilt on every edit
    position/
      position.ts       ← Position: { line, column }
      range.ts          ← Range: { start, end }
    utils.ts            ← word-boundary helpers
  editor/
    editorState.ts      ← EditorState: Document + Cursor + HistoryManager + listeners
    commands.ts         ← Command union type
    history.ts          ← HistoryManager: undo/redo stack
    cursor/
      cursor.ts         ← Cursor: anchor + active Position
  view/
    viewModel.ts        ← ViewModel: scroll state + visible-line queries
    types.ts            ← ViewLine type
  ui/
    EditorView.tsx      ← Main React component: keyboard, mouse, rendering
    EditorSetup.tsx     ← charWidth measurement + EditorConfigContext
    EditorConfigContext.tsx
    utils.ts            ← mapKeyboardEvent, buildSelectionRects
    components/
      Cursor.tsx, Gutter.tsx, Line.tsx, Scrollbar.tsx, Selection.tsx
  App.tsx               ← Wires Document → EditorState → ViewModel → EditorView
```

Dependency direction: `Core → Editor → View → UI` (no reverse dependencies).

---

## Layer-by-Layer Review

---

### 1. Core — Document (`document.ts`)

**Current implementation:**

```ts
class Document implements IDocument {
  private text: string;           // ← single flat string
  private lineIndex: LineIndex;

  insert(position, text)  → applyChange(...)
  delete(range)           → applyChange(...)
  replace(range, newText) → applyChange(...)

  private applyChange(change) {
    // offset-based splice on this.text
    this.text = this.text.slice(0, start) + insertedText + this.text.slice(end);
    this.lineIndex.rebuild(this.text);   // ← full rebuild
  }
}
```

**Impact: 🔴 HIGH — This is the central point of change.**

The Yjs integration replaces the internal `string` buffer with `Y.Text`.

- `this.text` → becomes a **derived snapshot** from `yText.toString()`
- `insert()` / `delete()` / `replace()` → must call `yText.insert()` / `yText.delete()` instead of string splicing
- `applyChange()` → must translate Position/Range into offsets and forward to `Y.Text`

**Key concern:** The `IDocument` interface itself remains stable. `getText()`, `getLineContent()`, `getTextInRange()` etc. are read-only queries on text — they work the same whether the backing store is a string or `Y.Text.toString()`.

**Decision needed:**

Option A — **Adapter pattern**: Create a new class `CollaborativeDocument implements IDocument` that wraps `Y.Text`. The existing `Document` class stays unchanged for solo mode.

Option B — **In-place modification**: Modify `Document` to accept an optional `Y.Text`, switching behavior internally.

**Recommended: Option A.** Keeps solo mode untouched. Collaboration is opt-in. The `IDocument` interface is the seam.

---

### 2. Core — LineIndex (`lineIndex.ts`)

**Current implementation:**

```ts
class LineIndex {
  private lineStarts: number[] = [];

  rebuild(text: string) {
    // Full scan of text to find '\n' positions
  }
}
```

**Impact: 🟡 MEDIUM**

- LineIndex `rebuild()` is called after every single edit — full O(n) scan.
- With Yjs, text changes arrive as events (`yText.observe`). Each event contains the exact delta (insert/delete positions and content).
- LineIndex can potentially be updated **incrementally** from the delta, rather than full-rebuilding.

**For Phase 1:** Keep the full rebuild. It's simple and correct. Optimize later.

**For future:** Use the Yjs delta to update `lineStarts` incrementally (Phase 5 extension).

---

### 3. Core — Position / Range

**Impact: 🟢 LOW — No changes needed.**

`Position` and `Range` are pure value types. They work with any backing document.

Yjs works with offsets internally. The `IDocument.getOffsetAt(position)` and `getPositionAt(offset)` methods already provide the conversion. These will be used by the collaborative document adapter.

---

### 4. Editor — EditorState (`editorState.ts`)

**Current implementation:**

```ts
class EditorState {
  private document: IDocument;     // ← interface, not concrete class
  private cursor: Cursor;
  private history: HistoryManager;
  private listeners: Set<() => void>;

  execute(command) { ... this.notifyListeners(); }
}
```

**Impact: 🟡 MEDIUM**

- **Good news:** `EditorState` depends on `IDocument` (the interface), not the concrete `Document` class. Swapping in a `CollaborativeDocument` is seamless.
- **Undo/Redo conflict:** The current `HistoryManager` records local undo/redo operations. In collaborative mode, undoing must only reverse **your own** operations, not other users'. Yjs provides `Y.UndoManager` for this exact purpose — it tracks operations per origin client.

**Decision needed:**

- In collaborative mode, replace `HistoryManager` with `Y.UndoManager`.
- `EditorState` should accept the undo manager through dependency injection rather than constructing it internally.

**For Phase 1:** Keep the current `HistoryManager`. Wire `Y.UndoManager` in a later phase.

---

### 5. Editor — Cursor (`cursor.ts`)

**Impact: 🟢 LOW for local cursor, 🟡 MEDIUM for remote cursors.**

The local cursor works exactly as before — it's just a `{anchor, active}` Position pair maintained by `EditorState`.

For collaboration, we need to represent **remote cursors** — other users' cursor positions. This is handled by the Yjs **awareness protocol**, not by the Cursor class itself.

Remote cursors will be:
- Stored as part of a new `AwarenessState` (separate from `Cursor`)
- Rendered as overlay UI components with labels and colors

The existing `Cursor` class does not need modification.

---

### 6. Editor — Commands (`commands.ts`)

**Impact: 🟢 LOW — No changes needed.**

Commands represent user intent. They are local to each client. Yjs does not interact with the command system — it operates at the document mutation level below commands.

---

### 7. Editor — History (`history.ts`)

**Impact: 🟡 MEDIUM — Needs replacement in collaborative mode.**

Current `HistoryManager` stores full `EditOperation` objects with `doRange`, `undoRange`, `doText`, `undoText`. This only works for a single user.

In collaborative mode:
- User A inserts text at position 5
- User B inserts text at position 3
- If User A undoes, their undo must account for User B's insertion shifting offsets

`Y.UndoManager` handles this automatically. It tracks operations by **origin** (client ID) and transforms undo operations against concurrent changes.

**Action:** Make `EditorState` accept an undo/redo strategy interface. Solo mode uses `HistoryManager`. Collaborative mode uses a wrapper around `Y.UndoManager`.

---

### 8. View — ViewModel (`viewModel.ts`)

**Impact: 🟢 LOW — No changes needed.**

`ViewModel` queries `IEditorState` on demand. It has no knowledge of the document backing store. It will continue to work unchanged whether the document is local or collaborative.

The only addition later (Phase 3/4) will be rendering remote cursors — but that's an additive UI concern, not a ViewModel change.

---

### 9. UI — EditorView (`EditorView.tsx`)

**Impact: 🟢 LOW for Phase 1, 🟡 MEDIUM for Phase 3/4.**

Phase 1: No changes. `EditorView` talks to `IViewModel` — it doesn't know or care about the backing store.

Phase 3/4: New components for remote cursor rendering and user presence. These are additive — new React components, not modifications to existing ones.

---

### 10. App.tsx — Wiring

**Current implementation:**

```tsx
const doc = new Document(INITIAL_TEXT);
const cursor = new Cursor(new Position(0, 0));
const editorState = new EditorState(doc, cursor);
const viewModel = new ViewModel(editorState);
```

**Impact: 🟡 MEDIUM — This is where solo vs. collaborative mode is decided.**

In collaborative mode:

```tsx
const ydoc = new Y.Doc();
const ytext = ydoc.getText('content');
const doc = new CollaborativeDocument(ytext);   // ← swap
const cursor = new Cursor(new Position(0, 0));
const editorState = new EditorState(doc, cursor);
const viewModel = new ViewModel(editorState);

// Start syncing
const provider = new WebsocketProvider('ws://localhost:1234', 'room-1', ydoc);
```

The wiring code changes, but the pipeline stays the same.

---

## Readiness Summary

| Component | Readiness | Action Required |
|---|---|---|
| `IDocument` interface | ✅ Ready | None — clean seam for swapping |
| `Document` class | 🔴 Must be wrapped | Create `CollaborativeDocument` adapter |
| `LineIndex` | ✅ Ready (optimize later) | Full rebuild is fine for Phase 1 |
| `Position` / `Range` | ✅ Ready | No changes |
| `EditorState` | ✅ Ready | Already depends on `IDocument` interface |
| `Cursor` | ✅ Ready | No changes |
| `Commands` | ✅ Ready | No changes |
| `HistoryManager` | ⚠️ Solo only | Replace with `Y.UndoManager` in collab mode |
| `ViewModel` | ✅ Ready | No changes |
| `EditorView` | ✅ Ready | Additive changes later for remote cursors |
| `App.tsx` | ⚠️ Needs branching | Solo vs. collaborative wiring |

---

## Critical Risks

### 1. Event Loop Contention

Yjs emits change events when remote operations arrive. If these events trigger a full `lineIndex.rebuild()` + React re-render on every remote keystroke, performance may degrade with many concurrent users.

**Mitigation:** Batch remote updates. Yjs `Y.Text.observe` fires once per transaction, not per character. This is manageable.

### 2. Cursor Position Drift

When a remote user inserts text before the local cursor, the local cursor's Position becomes stale (it now points to the wrong location).

**Mitigation:** After applying remote changes, recalculate the local cursor's offset using `Y.Text` relative positioning. Yjs supports this via `Y.RelativePosition`.

### 3. Undo/Redo Complexity

The current history system is fundamentally incompatible with collaborative editing. If not addressed, undoing in collaborative mode will corrupt the document.

**Mitigation:** This is why Phase 1 may initially disable undo/redo, then Phase 2+ introduces `Y.UndoManager`.

---

## Architectural Strengths

The codebase is **well-prepared** for collaboration because:

1. **Interface-first design** — `IDocument`, `IEditorState`, `IViewModel` are all interfaces. Swapping implementations is the intended pattern.
2. **Clean layer separation** — UI never touches Document directly. All mutations go through `EditorState.execute(command)`.
3. **Single update path** — `EditorState` notifies listeners → UI re-queries → re-renders. Remote changes can use the same path.
4. **No orphan state** — There are no stale copies of document text floating in React state. Everything derives from the source of truth.

These properties are exactly what collaborative systems require.

---

## Next

```
Phase 1 — Yjs Core Integration
```

Focus:

```
installing yjs
creating CollaborativeDocument
bridging Y.Text mutations with the IDocument interface
observing remote changes and notifying listeners
```
