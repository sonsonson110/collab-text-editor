# 📘 Phase 6 — Rendering Layer

## Objective

Understand how to transform the **view model into actual UI**, while ensuring:

* efficient updates
* minimal re-rendering
* clean separation from core logic

---

# 1. Role of the Rendering Layer

The rendering layer sits on top of the view model:

```
Core → Editor → View → UI (Rendering)
```

Its responsibility is simple:

```
take visible data → display it on screen
```

It must NOT:

* modify the document
* handle editing logic
* compute viewport

---

# 2. Rendering Pipeline

The full pipeline now becomes:

```
Document (full text)
    ↓
EditorState (cursor + interaction)
    ↓
ViewModel (visible lines)
    ↓
Rendering Layer (UI)
```

---

## Key Insight

Rendering should depend ONLY on:

```
ViewModel output
```

Not on:

```
Document
Cursor internals
LineIndex
```

---

# 3. Rendering Unit: Line

The fundamental rendering unit is:

```
ViewLine
```

Your structure:

```ts
type ViewLine = {
  lineNumber: number;
  content: string;
}
```

---

## Why line-based rendering?

Because:

* text is naturally segmented by lines
* scrolling operates on lines
* updates are localized per line

---

# 4. Basic Rendering Model

Conceptually:

```
for each visible line:
    render line
```

In UI (React-like):

```tsx
visibleLines.map(line => (
  <Line key={line.lineNumber} content={line.content} />
))
```

---

# 5. Cursor Rendering

The cursor is NOT part of text.

It is an overlay.

---

## Data flow

```
ViewModel → cursor viewport position
```

```ts
{ line: number, column: number }
```

---

## Rendering logic

* find the correct line
* place cursor at column position

---

## Key rule

```
Cursor rendering must not modify text content
```

---

# 6. Incremental Rendering (Core Concept)

### Problem

Re-rendering the entire viewport every time is inefficient.

---

### Solution

Only update what changed.

---

## Types of updates

### 1. Text change

Only affected lines should re-render.

---

### 2. Cursor movement

Only:

* previous cursor position
* new cursor position

should update

---

### 3. Scrolling

* reuse existing DOM nodes if possible
* shift visible window

---

## Key Idea

```
UI updates should be LOCAL, not GLOBAL
```

---

# 7. Identity and Keys

Each line must have a stable identity:

```ts
key = line.lineNumber
```

---

## Why?

To allow UI systems (like React) to:

* reuse DOM nodes
* avoid full re-render

---

# 8. Virtualization (Important Concept)

Even the viewport may be large.

Advanced editors render:

```
only visible + small buffer
```

Example:

```
Viewport: 100 → 140
Render:   95 → 145
```

---

## Why?

* smoother scrolling
* avoids blank gaps
* improves perceived performance

---

# 9. Separation Rules (Critical)

### Rendering Layer MUST

* consume ViewModel
* render UI components

---

### Rendering Layer MUST NOT

* access Document directly ❌
* compute viewport ❌
* modify cursor ❌

---

# 10. Minimal Rendering Architecture

Suggested structure:

```
view/
    viewModel.ts

ui/
    EditorView.tsx
    Line.tsx
    Cursor.tsx
```

---

## Responsibilities

### EditorView

* gets ViewModel
* renders visible lines
* renders cursor

---

### Line Component

* renders text
* no knowledge of document

---

### Cursor Component

* renders position
* purely visual

---

# 11. Update Flow

After an edit:

```
EditorState changes
    ↓
ViewModel reflects new state
    ↓
UI re-renders affected parts
```

---

# 12. Phase 6 Outcome

After completing this phase you should:

---

## Understand

* how data flows into UI
* why rendering must be incremental
* how cursor is visualized separately
* why ViewModel isolates UI from core

---

## Be able to

* render visible lines
* render cursor correctly
* update UI after edits
* avoid full re-rendering

---

# 13. What NOT to over-engineer yet

Avoid:

* complex diff algorithms
* advanced virtualization libraries
* performance micro-optimizations

Focus on:

```
correct structure > performance tricks
```

---

# ✅ Final Mental Model

```
Document → truth
Editor   → interaction
View     → visibility
UI       → pixels
```
