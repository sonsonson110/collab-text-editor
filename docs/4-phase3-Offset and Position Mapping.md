# Phase 3 — Offset and Position Mapping

## Objective

Understand how an editor converts between **internal text positions and human-readable locations**.

Editors must constantly translate between:

* **offsets** used internally by the engine
* **line/column positions** used by users and UI

This phase focuses on building a **reliable mapping between these two coordinate systems**.

---

# 1. Two Coordinate Systems in an Editor

A text editor works with two different ways of locating text.

---

## Character Offset

An **offset** represents the position of a character relative to the start of the document.

Example concept:

```
Hello\nWorld
0123456789
```

Meaning:

* `H` → offset 0
* `e` → offset 1
* `\n` → offset 5
* `W` → offset 6

Advantages:

* very efficient for internal operations
* easy to slice text
* simplifies insert and delete operations

---

## Line and Column

A **position** describes a location using line and column numbers.

Example:

```
Line 2, Column 3
```

Meaning:

```
World
   ^
```

Advantages:

* intuitive for users
* used by cursor display
* used by selections
* used by diagnostics and error messages

---

### Key Insight

Editors usually:

* **store and manipulate text using offsets**
* **expose line/column positions to the UI**

Because humans think in **lines**, but computers operate more efficiently with **offsets**.

Milestone:
Understand why editors must support **both coordinate systems simultaneously**.

---

# 2. The Role of the Line Index

A line index stores information about where each line begins in the document.

Example text:

```
Hello
World
Editor
```

Internal representation:

```
lineStarts = [0, 6, 12]
```

Meaning:

```
line 0 starts at offset 0
line 1 starts at offset 6
line 2 starts at offset 12
```

This structure allows the editor to quickly answer questions like:

* where does a line begin
* how many lines exist
* which line an offset belongs to

Without this index, the editor would need to **scan the entire document repeatedly**, which would be slow.

Milestone:
Understand that **line start offsets enable fast position calculations**.

---

# 3. Converting Position → Offset

If we know:

```
line number
column number
```

we can compute the offset.

Conceptual rule:

```
offset = lineStart + column
```

Example:

```
lineStarts = [0, 6]
```

Position:

```
line 1
column 2
```

Calculation:

```
offset = 6 + 2 = 8
```

Result:

```
Hello
Wo[r]ld
```

This conversion is **simple and fast**.

Milestone:
Understand that converting **position to offset is a direct calculation**.

---

# 4. Converting Offset → Position

The reverse conversion is slightly more complex.

We must determine **which line contains the offset**.

Example:

```
lineStarts = [0, 6, 12]
```

Offset:

```
9
```

We check which range contains the offset:

```
0 ≤ offset < 6   → line 0
6 ≤ offset < 12  → line 1
```

Therefore:

```
line = 1
column = offset - lineStart
```

Result:

```
column = 9 - 6 = 3
```

Final position:

```
line 1, column 3
```

Milestone:
Understand how an editor determines **which line contains a given offset**.

---

# 5. Why This Mapping Is Critical

Almost every editor feature depends on this conversion.

Examples include:

Cursor movement

```
cursor offset → position → render cursor
```

Mouse click

```
screen location → position → offset
```

Selections

```
start offset
end offset
→ convert to positions for display
```

Rendering visible lines

```
offset range → determine visible lines
```

Diagnostics and syntax highlighting

```
error offset → display line/column
```

Milestone:
Recognize that **offset/position mapping is used everywhere in an editor**.

---

# 6. Performance Considerations

Editors may perform **thousands of conversions per second**.

Therefore:

* the mapping must be efficient
* the line index must support fast lookups

Early implementations may use **simple search**, but more advanced editors use:

* **binary search**
* **incremental updates**

Learning focus:

Start with a **clear conceptual model**, then optimize later.

Milestone:
Understand that mapping must scale for **large documents and frequent queries**.

---

# 7. Core Architecture Principle

The conversion logic belongs to the **core engine**, not the UI.

The core should expose functions like:

```
getPositionAt(offset)

getOffsetAt(position)
```

The UI should **never directly manipulate internal text structures**.

Instead, the UI asks the core for information.

Architecture flow:

```
UI
↓
Document
↓
LineIndex
```

Milestone:
Understand that **coordinate conversions belong to the document engine**.

---

# 8. Questions to Test Understanding

Before moving to the next phase, you should understand:

---

### Why editors internally prefer offsets

Offsets allow:

* simple numeric calculations
* efficient text slicing
* easier insert and delete operations

---

### Why users interact with line and column positions

Humans read text in **lines**, not offsets.

Therefore UI components display:

```
Line 10, Column 5
```

instead of:

```
Offset 534
```

---

### Why a line index is required for efficient conversions

Without a line index:

* finding the line for an offset would require scanning the document
* this would be slow for large files

A line index allows the editor to quickly determine **line boundaries**.

---

### Why offset → position conversion is more complex than position → offset

Position → Offset:

```
offset = lineStart + column
```

Offset → Position requires determining:

```
which line contains the offset
```

before calculating the column.

---

### Why offset/position conversions occur frequently in editors

Many editor features depend on them:

* cursor rendering
* mouse interaction
* selections
* syntax highlighting
* diagnostics
* viewport rendering

These operations require converting between **engine coordinates and UI coordinates**.

---

# Phase 3 Outcome

After completing this phase, you should understand:

* why editors maintain two coordinate systems
* how offsets and positions relate
* how a line index enables fast conversions
* why these conversions are fundamental to editor architecture

This knowledge forms the foundation for implementing:

```
cursor movement
text selections
editing operations
rendering
```

---

# Next Phase

```
Phase 4 — Editing Operations
```

Focus:

* inserting text
* deleting text
* replacing ranges
* updating the document state
* updating the line index after edits

This introduces the **core editing pipeline of a text editor**.

---

If you'd like, I can also help you create a **Phase 3 “thinking exercises” section** (the kind real editor engineers use) that will **dramatically deepen your understanding before coding**.
