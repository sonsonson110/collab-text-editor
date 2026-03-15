# Phase 1 — Core Data Abstractions

## Objective

Learn how an editor represents text and edits using **clear abstractions instead of raw strings**.

The goal of this phase is **not performance or UI**, but building a **clean mental model of a document and how it changes**.

---

## 1. Understand the Document as a Data Model

In an editor, the document should be treated as a **structured data model**, not just a text string.

The document abstraction represents:

* the current text content
* a way to read parts of the content
* a way to apply edits

Conceptually, the document is responsible for:

* storing text
* applying changes
* exposing the updated state

What matters is defining **what a document can do**, not how it stores data internally.

Learning focus:

* treat text as a model
* avoid mixing UI concerns
* keep document logic independent

Milestone:
A document abstraction capable of representing editable text.

---

## 2. Define Position

Editors must locate text precisely.

A **position** represents a single location in the document.

Typical responsibilities of a position abstraction:

* identify a location in text
* compare positions
* move between positions

Conceptual questions to think about:

* How do we represent a location in text?
* How do we compare two positions?
* How do we detect whether one position is before another?

Learning focus:

* positions must be stable and consistent
* avoid mixing visual coordinates with logical text positions

Milestone:
A clear abstraction for identifying a location in text.

---

## 3. Define Range

A **range** represents a span of text between two positions.

Ranges allow editors to describe:

* selections
* edits
* replacements

Key ideas:

* a range has a start position
* a range has an end position
* the start should always be before the end

Learning focus:

* represent text spans in a predictable way
* treat ranges as first-class concepts

Milestone:
Ability to represent and reason about spans of text.

---

## 4. Define Change

Editors do not replace the entire document when editing.

Instead they describe **changes**.

A change abstraction represents:

* what part of the document changed
* what content replaced it

Conceptually a change answers:

* where the change happened
* what text was removed
* what text was inserted

Learning focus:

* separate document state from document modifications
* describe edits as structured data

Milestone:
Ability to describe a modification without applying it yet.

---

## 5. Define Edit Operations

Edit operations are **actions applied to the document**.

Common conceptual operations:

* insertion
* deletion
* replacement

Each operation should:

* describe the intent of the edit
* modify the document through the change abstraction

Learning focus:

* represent user actions as operations
* keep operations independent from UI events

Milestone:
A clear conceptual pipeline:

User intent → Edit operation → Document change → Updated document

---

## 6. Separation Principles

During this phase, follow these rules strictly.

Document layer should not know about:

* rendering
* UI frameworks
* keyboard input
* cursor visuals

Document layer should only know:

* text
* positions
* ranges
* edits

This separation is critical for editor architecture.

---

## 7. Questions to Guide Your Learning

Before moving to the next phase, you should be able to answer:

* What is the difference between a position and a range?
    * Position → a single location in a document
    * Range → a span between two positions (a segment of text)

* Why should edits be represented as changes instead of replacing the entire document?
    * Editors describe what changed, not the entire document.
    * This allows for efficient updates and better performance.
    
* Why should the document model not depend on UI?
    * To keep the core logic of text manipulation separate from how it is displayed.
* Why are edit operations separate from user input?
    * User input expresses intent, not the edit itself.