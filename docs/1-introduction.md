# Learning Path: Building an Editor Engine and UI

## Goal

Learn how to design and structure a small editor system while focusing on **abstraction and architecture**, not detailed implementation.

---

## Phase 1 — Core Data Abstractions

Understand how text is represented and manipulated.

Key concepts:

* Document model
* Position
* Range
* Change
* Edit operation

Learning objectives:

* Understand how a document can be treated as structured data rather than a plain string.
* Define abstractions that describe where edits happen.
* Separate "what changed" from "how it is displayed".

Milestone:

* A document abstraction that supports insert and delete operations.

---

## Phase 2 — Text Structure and Indexing

Focus on how large text is organized internally.

Key concepts:

* Line indexing
* Offset mapping
* Text segmentation
* Efficient lookup

Learning objectives:

* Understand how editors convert between line/column and character offset.
* Maintain fast navigation within large text.
* Design structures that allow efficient updates after edits.

Milestone:

* Ability to query lines and translate between position formats.

---

## Phase 3 — Editing Model

Introduce the idea that user actions become commands.

Key concepts:

* Editor commands
* Command abstraction
* Intent vs execution
* Undo/redo model

Learning objectives:

* Separate user intent from document mutation.
* Represent editing actions as structured commands.
* Track changes in a reversible way.

Milestone:

* Command pipeline that modifies the document model.

---

## Phase 4 — Cursor and Selection Model

Represent how users interact with text.

Key concepts:

* Cursor
* Selection
* Anchor and active positions
* Navigation rules

Learning objectives:

* Understand cursor movement independent of rendering.
* Model text selection behavior.
* Handle multiple cursor states conceptually.

Milestone:

* Cursor and selection state maintained separately from the document.

---

## Phase 5 — View Model

Introduce a layer that connects the document to rendering.

Key concepts:

* Viewport
* Visible lines
* Layout model
* Scroll state

Learning objectives:

* Understand how editors render only visible content.
* Separate document state from visual state.
* Track what portion of the document is visible.

Milestone:

* A view model that exposes visible lines.

---

## Phase 6 — Rendering Layer

Focus on translating the view model into UI.

Key concepts:

* Rendering pipeline
* Line rendering
* Virtualization
* Incremental updates

Learning objectives:

* Render only the visible portion of text.
* Update UI incrementally after edits.
* Avoid full document re-rendering.

Milestone:

* Editor UI displaying text using a viewport system.

---

## Phase 7 — Event and Input System

Connect user input to editor commands.

Key concepts:

* Keyboard input
* Mouse interaction
* Event dispatch
* Input abstraction

Learning objectives:

* Translate input events into editor commands.
* Keep input handling separate from document logic.
* Maintain predictable event flow.

Milestone:

* Keyboard input triggering editing operations.

---

## Phase 8 — System Integration

Combine all subsystems into a working editor.

Key concepts:

* Layer boundaries
* Dependency direction
* Module organization

Learning objectives:

* Ensure the core engine does not depend on UI.
* Maintain clean separation between layers.
* Integrate document, editor model, and rendering.

Milestone:

* A minimal but complete editor pipeline.

---

## Architecture Principle to Follow

Layer order:

Core → Editor → View → UI

Rules:

* Lower layers must not depend on higher layers.
* UI should never contain core logic.
* Each layer should expose clear abstractions.

---

## Learning Strategy

Focus on understanding:

* How systems communicate through abstractions
* Why each layer exists
* How responsibilities are separated

Avoid focusing too early on:

* UI details
* performance optimizations
* complex frameworks

The primary objective is to **build intuition about system design and abstraction boundaries**.
