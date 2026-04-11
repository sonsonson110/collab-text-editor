# Collaboration — Introduction

## Goal

Add **real-time collaborative editing** to the educational text editor using **Yjs**, a CRDT library.

The objective is to learn **how collaborative systems work** — how multiple users edit the same document concurrently without conflicts — while keeping the implementation simple enough to understand and extend later.

---

## Why Yjs?

Yjs is a high-performance CRDT (Conflict-free Replicated Data Type) implementation for JavaScript/TypeScript.

Key reasons for choosing it:

* **No central authority required** — every client carries a full copy of the document; merges are automatic and deterministic.
* **Works with any transport** — WebSocket, WebRTC, or even a database.
* **Mature ecosystem** — `y-websocket` for a turnkey server, `y-protocols` for wire format, awareness protocol for cursors.
* **Small conceptual surface** — only a few primitives: `Y.Doc`, `Y.Text`, `Y.Map`, `Y.Array`.
* **Widely used** — powers collaboration in Tiptap, BlockNote, Notion-like apps, and many others.

---

## What is a CRDT?

A CRDT is a data structure designed so that **every replica can be modified independently and later merged without conflicts**.

Traditional approaches (OT — Operational Transformation) require a central server to order operations.

CRDTs do not. Two users can type at the same time, go offline, reconnect, and their documents will converge to the same state — guaranteed by the math.

How Yjs works conceptually:

```
User A types "Hello" at position 5
User B types "World" at position 5

OT:    server must transform one operation against the other
CRDT:  each character has a unique ID; merge is deterministic
       result: "HelloWorld" or "WorldHello" — always the same
       on every client, every time.
```

---

## Learning Objectives

After completing the collaboration phases, you should understand:

* How a shared document differs from a local document
* Why CRDTs solve the conflict problem without a central server
* How to bridge a CRDT data model (`Y.Text`) with a custom editor engine
* How WebSocket connections synchronize document state
* How "awareness" works — showing remote cursors and user presence
* How to keep the architecture modular so collaboration is opt-in, not forced

---

## Architecture Principle

The foundation series established this layer order:

```
Core → Editor → View → UI
```

Collaboration introduces a **parallel concern** that wraps around the existing layers:

```
                 ┌─────────────────────┐
                 │   Collaboration     │
                 │   (Yjs + Network)   │
                 └──────┬──────────────┘
                        │ binds to
          ┌─────────────▼─────────────┐
          │        Core (Document)     │
          │        Editor (State)      │
          │        View (ViewModel)    │
          │        UI (EditorView)     │
          └────────────────────────────┘
```

Rules:

* The collaboration layer **wraps** the document — it does not reach into the editor, view, or UI.
* The editor, view, and UI layers remain **unaware** of whether collaboration is active.
* The collaboration layer is **opt-in** — the editor must still work in solo mode with zero collaboration code loaded.

---

## Scope of This Series

| Phase | Focus |
|---|---|
| Phase 1 | Replace the local `Document` string buffer with `Y.Text` as the source of truth |
| Phase 2 | Spin up a `y-websocket` server for multi-client synchronization |
| Phase 3 | Implement awareness: remote cursor positions, user presence |
| Phase 4 | UI for collaboration: user avatars, remote cursor rendering |
| Phase 5 | Extensions roadmap: offline support, permissions, room management |

Each phase builds on the previous one, just like the foundation series.

---

## What This Is NOT

This series does not aim to:

* Build a production-ready collaboration platform
* Implement access control or authentication
* Handle complex conflict resolution UX (e.g. "accept/reject changes")
* Optimize for thousands of concurrent users

The focus is **understanding the mechanics** — building intuition about distributed editing systems.

---

## Prerequisites

Before starting the collaboration phases, ensure the foundation editor is fully functional:

* ✅ Document model with insert/delete/replace
* ✅ Cursor and selection system
* ✅ Undo/redo history
* ✅ ViewModel and viewport system
* ✅ Full keyboard and mouse input handling
* ✅ Reactive update pipeline (EditorState → notify → UI re-queries ViewModel)

All of these are complete in the current codebase.

---

## Next

```
Phase 1 — Yjs Core Integration
```

Focus:

```
introducing Y.Doc and Y.Text
bridging Y.Text with the existing Document interface
observing remote changes
keeping the existing API surface stable
```
