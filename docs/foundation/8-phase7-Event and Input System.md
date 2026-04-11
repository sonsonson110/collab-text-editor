# 📘 Phase 7 — Event and Input System

## Objective

Understand how an editor converts **user input into structured editing actions**, while keeping input handling **independent from core logic**.

This phase connects:

```
User Input → Editor Commands → Document Changes
```

---

# 1. Why an Input System Exists

So far, your system can:

```
✔ represent text
✔ apply edits
✔ track cursor
✔ render visible content
```

But it **cannot react to user actions** yet.

The input system answers:

```
How does user interaction trigger editor behavior?
```

---

# 2. Core Principle: Input ≠ Logic

User input should NOT directly modify:

```
Document ❌
Cursor ❌
ViewModel ❌
```

Instead:

```
Input → Command → EditorState → Document
```

---

## Key Insight

```
Input expresses INTENT
Editor executes LOGIC
```

---

# 3. Types of Input

Editors handle multiple input sources:

### Keyboard

```
typing characters
Enter (newline)
Backspace / Delete
Arrow keys (navigation)
```

---

### Mouse

```
click → move cursor
drag → create selection
scroll → change viewport
```

---

### System Events

```
IME input (for complex languages)
clipboard (copy/paste)
focus/blur
```

---

# 4. Introducing Commands

A **command** represents a user intention in a structured way.

Examples:

```
InsertText("a")
DeleteBackward
MoveCursorLeft
MoveCursorRight
InsertNewLine
```

---

## Why commands?

They:

```
decouple input from logic
standardize behavior
enable undo/redo later
```

---

## Mental Model

```
Keyboard Event: "A key pressed"

↓

Command: InsertText("A")

↓

EditorState.insert("A")
```

---

# 5. Input → Command Mapping

You need a translation layer:

```
DOM Event → Command
```

---

## Example

```
keydown: "a"
→ InsertText("a")

keydown: "Backspace"
→ DeleteBackward

keydown: "ArrowLeft"
→ MoveCursorLeft
```

---

## Important Rule

```
UI layer handles events
Editor layer handles commands
```

---

# 6. Command Execution Flow

Once a command is created:

```
Command
   ↓
EditorState method
   ↓
Document update
   ↓
Cursor update
   ↓
ViewModel reflects changes
   ↓
UI re-renders
```

---

## Full Pipeline

```
User Input
    ↓
Event Handler (UI)
    ↓
Command
    ↓
EditorState
    ↓
Document
    ↓
ViewModel
    ↓
UI
```

---

# 7. Cursor & Selection Through Input

Input must control:

```
cursor movement
selection expansion
selection collapse
```

---

## Example: Arrow Key

```
ArrowRight:

if no selection:
    move cursor right

if selection exists:
    collapse to end
```

---

## Example: Shift + Arrow

```
Shift + ArrowRight:

expand selection
(anchor stays, active moves)
```

---

# 8. Text Input Behavior

Typing must follow rules:

---

## Case 1: No selection

```
Insert at cursor
Move cursor forward
```

---

## Case 2: With selection

```
Replace selection
Collapse cursor to end
```

---

# 9. Deletion Behavior

---

## Backspace

```
if selection exists:
    delete selection

else:
    delete character before cursor
```

---

## Delete key

```
if selection exists:
    delete selection

else:
    delete character after cursor
```

---

# 10. Separation of Layers (Critical)

### UI Layer

Handles:

```
DOM events
keyboard input
mouse interaction
```

---

### Editor Layer

Handles:

```
commands
editing logic
cursor updates
document mutation
```

---

### Core Layer

Handles:

```
text storage
range operations
line indexing
```

---

## Rule

```
UI → Editor → Core
NEVER the reverse
```

---

# 11. Minimal Architecture for This Phase

Suggested structure:

```
ui/
    inputHandler.ts   ← NEW
    EditorView.tsx

editor/
    commands.ts       ← NEW (optional)
    editorState.ts

core/
    (unchanged)
```

---

# 12. What to Build (Milestone)

A minimal system that supports:

```
✔ typing characters
✔ backspace deletion
✔ arrow key navigation
✔ basic selection (optional but recommended)
```

---

# 13. What NOT to Overbuild

Avoid:

```
❌ full shortcut system
❌ complex IME handling
❌ clipboard integration
❌ advanced keybinding configs
```

Focus on:

```
correct event → command → execution flow
```

---

# 14. Phase 7 Mental Model

```
Input is NOT editing

Input → Command
Command → Editor logic
Editor → Document
Document → View
View → UI
```

---

# ✅ Final Understanding

After this phase, you should clearly understand:

```
how user input becomes structured commands
why commands decouple UI from logic
how editing behavior is centralized in EditorState
how input flows through the system cleanly
```

---

# Next Phase

```
Phase 8 — System Integration
```

Focus:

```
connecting all layers into a cohesive editor
ensuring clean boundaries
removing temporary hacks (polling, etc.)
```
