# Phase 4 — Cursor and Selection Model

## Objective

Understand how an editor represents **user interaction with text**, specifically:

* cursor position
* text selection
* navigation behavior

This phase introduces a new layer that sits **above the document model**, responsible for describing **where the user is and what they are selecting**, without modifying the document directly.

---

# 1. Cursor as a Logical Concept

In an editor, the cursor represents **a position in the document where actions occur**.

However, the cursor should not be treated as a simple position.

Instead, it must support both:

```
single point (no selection)
text selection (range of text)
```

This leads to a more general model.

---

# 2. Anchor and Active Positions

A cursor is defined by two positions:

```
anchor
active
```

### Anchor

The fixed starting point of a selection.

### Active

The current moving end of the selection.

---

### Key Insight

```
If anchor === active → no selection (just a cursor)

If anchor ≠ active → there is a selection
```

---

### Example

Selection from left to right:

```
Hello World
      ↑     ↑
   anchor  active
```

Selection from right to left:

```
Hello World
      ↑     ↑
   active  anchor
```

The direction matters for user interaction, but the document only cares about the resulting range.

---

# 3. Cursor as a Range

Because a cursor always defines a span (even if empty), it can be converted into a range.

Conceptually:

```
Cursor → Range
```

Rules:

```
start = min(anchor, active)
end   = max(anchor, active)
```

This allows all editing operations to reuse the existing **range-based editing model** from Phase 3.

---

# 4. Separation from Document

The cursor must not belong to the document layer.

### Why?

The document represents:

```
text content
text structure
text changes
```

The cursor represents:

```
user interaction state
```

Mixing them would break separation of concerns.

---

### Rule

```
Document does NOT know about cursor
Cursor does NOT modify document directly
```

---

# 5. Introducing the Editor Layer

To manage cursor and document together, a new layer is introduced:

```
Editor State
```

This layer acts as a bridge between:

```
user interaction
document model
```

---

## Editor State Responsibilities

```
hold the document
hold the cursor
coordinate editing operations
```

---

### Conceptual Structure

```
EditorState
    document
    cursor
```

---

### Important Principle

```
Core (Document) is pure data + logic
EditorState is interaction state
```

---

# 6. Editing Flow with Cursor

With the cursor model in place, editing follows a consistent pipeline:

```
Cursor State
     ↓
Convert to Range
     ↓
Create Change
     ↓
Apply to Document
     ↓
Update Cursor
```

---

### Example: Typing a Character

```
Cursor at position (line 2, column 4)
```

↓

```
Convert to range:
(2,4) → (2,4)
```

↓

```
Replace with "A"
```

↓

```
Document updated
```

↓

```
Cursor moves forward
```

---

### Example: Deleting Selection

```
Cursor selection:
(1,3) → (1,7)
```

↓

```
Replace with ""
```

↓

```
Document updated
```

↓

```
Cursor collapses to start
```

---

# 7. Cursor Behavior Rules

The cursor must follow consistent logical rules.

---

## Collapsed Cursor

```
anchor === active
```

Represents a single insertion point.

---

## Expanded Selection

```
anchor ≠ active
```

Represents selected text.

---

## Normalization

Even if selection direction differs:

```
(anchor → active)
(active → anchor)
```

The resulting range must always be:

```
start ≤ end
```

---

# 8. Cursor Independence from Rendering

The cursor model must not depend on:

```
UI rendering
pixel coordinates
visual layout
```

It operates purely on:

```
document positions (line, column)
```

---

### Why this matters

This allows:

* consistent logic regardless of UI
* reuse in different rendering systems
* easier testing and reasoning

---

# 9. Relationship with Previous Phases

### From Phase 1

* Cursor uses `Position` and `Range`

---

### From Phase 2

* Cursor relies on correct position ↔ offset mapping

---

### From Phase 3

* Cursor converts to `Range` to produce changes

---

### Key Integration

```
Cursor → Range → Change → Document
```

---

# 10. Responsibilities After Phase 4

At this stage, the system is divided as:

---

## Core Layer

```
Position
Range
LineIndex
Document
```

Responsible for:

```
text storage
text structure
text modification
```

---

## Editor Layer

```
Cursor
EditorState
```

Responsible for:

```
user position
selection state
interaction logic
```

---

# 11. Phase 4 Outcome

After completing this phase you should understand:

```
why a cursor is more than a single position
how selections are represented using anchor and active
how cursor converts into range-based edits
why cursor must be separate from the document
how editor state bridges interaction and document logic
```

You now have a system that can:

```
represent user position
represent text selection
connect user interaction to document editing
```

---

# Next Phase

```
Phase 5 — View Model
```

Focus of the next phase:

```
viewport
visible lines
scroll state
separating document size from rendered content
```

This introduces how editors handle **large documents efficiently in the UI**.
