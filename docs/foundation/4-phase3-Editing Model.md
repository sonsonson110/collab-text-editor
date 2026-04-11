# Phase 3 — Editing Model

## Objective

Understand how a text editor converts **user editing intent into structured modifications of the document model**.

Instead of directly modifying text, editors represent edits as **structured operations** that can be applied to the document.

This phase introduces the **editing pipeline**.

---

# 1. From User Intent to Document Mutation

When a user interacts with an editor, they perform actions like:

```
typing characters
deleting text
replacing selections
```

However, the document model should **not directly depend on UI input**.

Instead, the editor converts user intent into **structured changes**.

Conceptual flow:

```
User Action
     ↓
Edit Operation
     ↓
Document Change
     ↓
Document State Update
```

This separation ensures that the document model remains **independent from UI behavior**.

---

# 2. Representing Changes

Editors do not update the entire document when something changes.

Instead they describe **what part of the document changed**.

A change must answer two questions:

```
Where did the change occur?
What text replaced the previous content?
```

Example conceptual change:

```
Range: (line 1, column 3) → (line 1, column 6)
Inserted Text: "abc"
```

This means:

```
Replace the text in the given range with "abc"
```

The change does not care **why** the modification occurred.

It only describes **what happened**.

---

# 3. Applying Changes to the Document

The document model is responsible for applying changes.

Conceptually:

```
Document
   ↓
Apply Change
   ↓
Update Internal Text
   ↓
Update Line Index
```

Because the editor stores text internally as a single string, applying a change usually involves:

```
text_before_change
+ inserted_text
+ text_after_change
```

After the modification:

```
line index must be updated
```

because line boundaries may have changed.

---

# 4. Range-Based Editing

All document edits are expressed in terms of **ranges**.

Even insertion is treated as a range operation.

Example:

```
Insert "Hello"
at position (line 2, column 4)
```

Internally represented as:

```
range: (2,4) → (2,4)
insertedText: "Hello"
```

Deletion is also expressed as a range:

```
range: (1,3) → (1,7)
insertedText: ""
```

Replacement simply combines both:

```
range: (1,3) → (1,7)
insertedText: "abc"
```

Using ranges ensures that **all edits follow a consistent model**.

---

# 5. Why Editors Use Structured Changes

Structured changes provide several important benefits.

### Predictability

All edits follow the same structure.

This simplifies reasoning about document updates.

---

### Undo and Redo

Editors can track changes and later reverse them.

Example:

```
delete "abc"
```

Undo requires:

```
insert "abc"
```

A structured change model makes this possible.

---

### Collaboration

Collaborative editors must synchronize changes from multiple users.

Systems like:

* Google Docs
* Notion

rely on structured change operations to merge edits correctly.

---

### Incremental Rendering

UI layers can update only the affected region instead of re-rendering the entire document.

This improves performance significantly.

---

# 6. Relationship With Offset and Position Mapping

Changes are defined using **ranges of positions**, but the document internally operates using **offsets**.

Therefore every edit requires conversion.

Conceptual flow:

```
Range (line/column)
      ↓
Offset calculation
      ↓
Text update
      ↓
Line index rebuild
```

This is why the previous phase focused on building reliable **offset ↔ position mapping**.

These conversions are required before every edit operation.

---

# 7. Responsibilities of the Document Layer

At this stage, the document layer is responsible for:

```
storing the text
applying changes
maintaining the line index
providing offset ↔ position conversions
providing text queries
```

The document layer must **not depend on UI or editor interaction logic**.

It should operate purely as a **text model**.

---

# 8. Current Editor Architecture

After Phase 3, the core system should resemble:

```
core/
   document/
   lines/
   position/
```

Where:

```
Position
    describes a location in the document

Range
    describes a span of text

LineIndex
    maps offsets to lines

Document
    stores text and applies changes
```

The UI and editor interaction layers will build on top of this foundation.

---

# 9. Phase 3 Outcome

After completing this phase you should understand:

```
how edits are represented as structured changes
how a document applies changes
how ranges define editing regions
why offsets are required internally
why line indexing must be updated after edits
```

You now have a **functional document editing model**.

---

# Next Phase

```
Phase 4 — Cursor and Selection Model
```

Focus of the next phase:

```
representing cursor position
tracking text selections
modeling anchor and active positions
cursor movement rules
```

These concepts allow users to **navigate and select text within the document**.

---
