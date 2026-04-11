# Phase 8 — System Integration

## Objective

Connect all layers into a **cohesive, clean editor pipeline** — without hacks, polling, or leaking concerns across boundaries.

---

## Mental Model

```
User Input
    ↓
inputHandler (UI layer)         ← translates DOM events → Commands
    ↓
EditorState.execute(command)    ← orchestrates all mutation
    ↓
Document                        ← source of truth for text
Cursor                          ← source of truth for position
    ↓
ViewModel                       ← computes what is visible
    ↓
EditorView / Line / Cursor UI   ← renders exactly what ViewModel exposes
```

**Each layer only talks to the one directly below it. Never skips. Never reverses.**

---

## What "Integration" Actually Means

Integration is not adding new features. It is ensuring:

- **No layer reaches past its neighbor** — UI never touches Document, ViewModel never mutates Cursor
- **One authoritative update path** — EditorState is the single mutation point; everything downstream is derived
- **Reactive, not polling** — UI re-renders because EditorState notifies, not because a timer fires
- **No orphan state** — there is no "local copy" of the document sitting in a React `useState`

---

## Current Architecture Audit

Reviewing what already exists:

| Layer | File(s) | Status |
|---|---|---|
| Core | `document.ts`, `lineIndex.ts`, `position.ts`, `range.ts` | ✅ Clean |
| Editor | `editorState.ts`, `cursor.ts`, `commands.ts` | ✅ Clean |
| View | `viewModel.ts`, `types.ts` | ⚠ ViewModel not reactive (no subscribe) |
| UI | `EditorView.tsx`, `Line.tsx`, `Cursor.tsx`, `inputHandler.ts` | ⚠ App.tsx instantiates everything imperatively |

---

## Key Problems to Fix in Phase 8

### 1. ViewModel is not reactive

`ViewModel` reads from `EditorState` on demand but does not subscribe to it. `EditorView` currently subscribes to `editor` directly and manually calls `viewModel.getVisibleLines()`.

**Fix:** ViewModel should either:

- Subscribe to EditorState itself and expose its own subscription, **or**
- Remain a pure query object (no state), and EditorView subscribes to EditorState then re-queries the ViewModel

The second is simpler and already close to what exists — just make it explicit and intentional.

### 2. App.tsx creates instances imperatively, outside React

```ts
// Current: all created outside React, nothing reactive
const doc = new Document(...);
const cursor = new Cursor(...);
const editor = new EditorState(doc, cursor);
const viewModel = new ViewModel(editor, 0, 10);
```

This is fine for now, but should be wrapped in `useMemo` or lifted to a stable reference so React doesn't recreate on every render.

### 3. Viewport does not follow the cursor

When the cursor moves outside the visible viewport (e.g. typing past line 10), the view does not scroll to follow it. The cursor becomes invisible.

**Fix:** After every `EditorState` update, check `viewModel.isCursorVisible()`. If false, scroll the viewport to bring the cursor into view.

### 4. Mouse input is missing

Phase 7 added keyboard input. Mouse clicks should move the cursor. This requires:

- Knowing the line height (already `--line-height: 20px` in CSS)
- Mapping `clientY` → line number, `clientX` → column (approximate using `ch` unit)

---

## Clean Integration Contract

Each layer's responsibility, stated precisely:

### Core Layer

- Owns text, positions, ranges, line indexing
- Has **no knowledge** of cursor, viewport, or React

### Editor Layer

- Owns `EditorState`: holds `Document` + `Cursor`
- Only mutation point in the system
- Exposes `subscribe(listener)` for reactive updates
- Executes `Command` objects — never raw keyboard events

### View Layer

- `ViewModel` is a **pure query facade** over EditorState
- Computes visible lines and cursor viewport position on demand
- Has **no internal mutable state** beyond scroll position
- Does not subscribe; it is queried by UI after EditorState notifies

### UI Layer

- `EditorView` subscribes to `EditorState`
- On notification: re-queries `ViewModel`, updates React state
- `inputHandler` maps DOM events → Commands, nothing else
- Components (`Line`, `Cursor`) are purely presentational

---

## Scroll-Follow Cursor Logic

After each command execution, the UI should ensure cursor visibility:

```
cursor.line < viewport.start  →  scroll up to cursor.line
cursor.line >= viewport.end   →  scroll down to (cursor.line - visibleLineCount + 1)
```

This belongs in `EditorView` (UI concern), calling `viewModel.scrollUp/Down`.

---

## Mouse Click → Cursor Move

```
onClick on editor div
    ↓
clientY / LINE_HEIGHT  →  absolute line number
clientX / charWidth    →  approximate column
    ↓
clamp to valid document position
    ↓
Command: { type: "move_cursor_to", position }
    ↓
editor.execute(command)
```

---

## Layer Dependency Direction (Enforced)

```
core       ← no dependencies on anything above
editor     ← depends on core only
view       ← depends on editor only
ui         ← depends on view + editor (for subscribe)
```

**Violations to actively avoid:**

- ❌ ViewModel importing from `document.ts` directly
- ❌ EditorView calling `document.insert()` directly
- ❌ Core knowing about React or DOM

---

## Phase 8 Milestone Checklist

```
✅ All layers connected through clean interfaces
✅ Single update path: EditorState → notify → UI re-queries ViewModel
✅ Viewport scrolls to follow cursor after every edit
✅ Mouse click moves cursor to correct position
✅ No polling, no redundant state copies
✅ App.tsx wires everything with stable references (useMemo / useRef)
```

---

## What NOT to do

- ❌ Add undo/redo now (requires command history — a Phase 9 concern)
- ❌ Optimize rendering with manual diffing
- ❌ Virtualize beyond the current visible line count
- ❌ Handle IME, clipboard, or complex keybindings

Focus: **correctness of the pipeline, cleanliness of boundaries.**

---

## Final System Picture

```
Document  →  single string + line index         (truth about text)
Cursor    →  anchor + active Position           (truth about selection)
EditorState  →  Document + Cursor + listeners   (mutation point)
ViewModel →  startLine + queries to EditorState (truth about visibility)
EditorView →  React state synced via subscribe  (pixels)
```

Every piece is in place. Phase 8 is about making the seams invisible.
