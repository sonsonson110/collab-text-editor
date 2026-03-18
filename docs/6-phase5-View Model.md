# Phase 5 — View Model

## Objective

Understand how an editor determines **what part of the document is visible**, without rendering the entire content.

This phase introduces a new layer that sits between:

Editor State → View Model → UI

---

# 1. Why a View Model Exists

Documents can be very large.

Example:

- thousands of lines
- millions of characters

Rendering the entire document is inefficient.

Instead, editors only render:

```

the visible portion of the document

```

---

# 2. Core Concept: Viewport

A viewport represents:

```

the visible region of the document

```

It is typically defined by:

```

start line
end line

```

Example:

```

Viewport:
lines 100 → 140

```

Only these lines should be rendered.

# 3. Separation of Responsibilities

The view model must not modify the document.

## Document Layer

Responsible for:

```

full text
line structure
text queries

```

---

## Editor Layer

Responsible for:

```

cursor
selection
editing logic

```

---

## View Model Layer

Responsible for:

```

visible lines
viewport state
scroll position
mapping document → UI

```

# 4. View Model Responsibilities

The view model answers questions like:

```
Which lines are visible?
What text should be rendered?
Where is the cursor within the visible region?
```

## Example API

```
getVisibleLines(): string[]
getViewportStart(): number
getViewportEnd(): number
```

# 5. Viewport State

The view model must track:

```
startLine
visibleLineCount
```

From this, it can compute:

```

endLine = startLine + visibleLineCount

```

---

## Example

```
startLine = 50
visibleLineCount = 20

→ render lines 50 → 69
```

# 6. Mapping Document to View

The view model uses the document to fetch data:

```
for each visible line:
document.getLineContent(line)
```

Important:

The view model does not store text.

It only queries the document.

# 7. Cursor in the View

The cursor exists in document coordinates:

```
(line, column)
```

The view model must determine:

```
Is the cursor inside the viewport?
```

## Example

```
Cursor at line 120
Viewport: 50 → 100
→ cursor is NOT visible
```

## If visible

```
relativeLine = cursor.line - viewport.startLine
```

This allows the UI to render the cursor in the correct position.

# 8. Scrolling

Scrolling changes the viewport.

## Example

Scroll down:

```
startLine += 1
```

Scroll up:

```
startLine -= 1
```

Important:

Scrolling does NOT modify the document.

It only updates the view model.

# 9. Key Insight

The document represents:

```
what exists
```

The view model represents:

```
what is visible
```

# 10. Architecture After Phase 5

```
core/
    document/
    lines/
    position/

editor/
    cursor/
    editorState/

view/
    viewModel/
```

# 11. Phase 5 Outcome

After completing this phase you should understand:

```
why editors do not render the entire document
how a viewport defines visible content
how to separate document data from visual representation
how scrolling affects only the view model
how cursor visibility is computed
```

You now have a system that can:

```
represent large documents efficiently
expose only visible content
prepare data for rendering
```

# Next Phase

```
Phase 6 — Rendering Layer
```

Focus:

```
turning visible lines into UI
efficient updates
virtualization techniques
```
