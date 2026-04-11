## Phase 2 — Text Structure and Indexing

### Objective

Understand how an editor organizes text internally so it can **navigate, query, and update large documents efficiently**.

The focus of this phase is **how to locate text quickly**, not how to render it.

---

## 1. Two Ways to Locate Text

Editors must convert between two ways of describing locations.

**Character Offset**

A single number representing the distance from the beginning of the document.

Example idea:

* start of document → offset 0
* next character → offset 1

Advantages:

* simple
* efficient for internal storage
* easy to compute insert/delete operations

---

**Line and Column**

A human-friendly location format.

Example idea:

* line 5, column 10

Advantages:

* intuitive for users
* used by UI, cursors, and selections

---

### Key Insight

Editors usually **store text using offsets internally**, but expose **line/column to the UI**.

Milestone:
Understand the need to translate between these two coordinate systems.

---

## 2. Line Indexing

Editors must quickly answer questions like:

* how many lines exist
* where a line starts
* what text belongs to a line

This requires maintaining a **line index**.

A line index tracks:

* line start positions
* line count
* mapping between lines and offsets

Learning focus:

* maintain a structure that updates when text changes
* ensure line lookup remains fast

Milestone:
Ability to query a specific line without scanning the whole document.

---

## 3. Offset ↔ Line Mapping

Because the editor uses two coordinate systems, it must convert between them.

Common queries:

Offset → Line/Column
Line/Column → Offset

Examples of usage:

* cursor movement
* selections
* rendering visible lines
* error diagnostics

Learning focus:
Understand how to maintain this mapping efficiently when edits occur.

Milestone:
Clear conceptual model of how conversions work.

---

## 4. Handling Line Breaks

Line breaks define how text becomes multiple lines.

Conceptual responsibilities:

* detect line boundaries
* update line structures when text changes
* maintain accurate line counts

Important idea:
A single edit can affect multiple lines.

Example effects:

* inserting a newline creates a new line
* deleting a newline merges two lines

Learning focus:
Understand how edits affect the line structure.

Milestone:
Awareness that line structure must be updated after every edit.

---

## 5. Incremental Updates

Editors must avoid recomputing everything after every change.

Instead, they update only the affected region.

Example reasoning:

If text changes in the middle of the document:

* lines before remain unchanged
* lines after may shift
* only local updates are required

Learning focus:
Think in terms of **local updates instead of global recalculation**.

Milestone:
Ability to reason about which parts of the document are affected by a change.

---

## 6. Separation Principle

The indexing system belongs to the **core layer**, not the UI.

The core should provide information like:

* total line count
* text of a line
* offset conversions

The UI layer will later use this information for rendering.

---

## 7. Questions to Test Understanding

Before moving to the next phase, you should understand:

* Why editors use both offsets and line/column coordinates.
  * Offset is efficient for the engine.
  * Line/Column is intuitive for the user.

* Why scanning the entire document for line queries is inefficient.
  * Editors perform many line queries.
  * Indexing avoids scanning the entire document each time.

* How a single edit can affect multiple lines.
  * Newline insertion → creates a new line.
  * Newline deletion → merges lines.

    Both require updating the line structure.

* Why indexing must be updated incrementally.
  * Incremental updates modify only the affected region, avoiding full document recalculation.
