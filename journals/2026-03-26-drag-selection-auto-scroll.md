# Drag Selection Auto-Scroll & Viewport Clipping

## Problem
1. **Stationary Drag-Scrolling Issue**: The text editor successfully processed drag selections natively. If the user dragged their mouse outside the container, it resolved an out-of-bounds line, which naturally triggered a scroll. However, this only fired on actual mouse movement. If the mouse was held stationary near the edge or outside the container, auto-scrolling stopped completely.
2. **Disappearing Selection Highlight**: If the document scrolled to the point where the original selection anchor (mousedown position) or the active cursor fell outside the visible viewport, the entire visual selection highlight disappeared because the view model's getters were returning `null` for off-screen bounds.

## Approach
To provide a smooth, continuous, and visually consistent drag-selection experience, we implemented the following capabilities.

### 1. `requestAnimationFrame` Loop for Continuous Scroll
We abandoned a purely event-based model in favor of an **animation frame loop** that runs actively during the drag state.

- **State Tracking**: `lastMousePosRef` stores the exact screen coordinates captured during continuous `mousemove` events.
- **Throttling**: The loop is throttled down to ~20FPS (executing exactly once every 50ms). This provides a predictable and pleasant scroll speed.
- **Margin Detection**: The loop checks the stationary `relativeY` pointer position against the editor bounds. If it falls within the `MARGIN` threshold at the inner top or inner bottom, the viewport is explicitly shifted via `viewModel.scrollUp(1)` or `scrollDown(1)`.

### 2. Logical Position Updates During Scroll
When the loop executes an explicit scroll, the viewport text shifts underneath the pointer.
Therefore, the same physical stationary coordinates (`clientX`, `clientY`) now point to a *different* logical line of text. The animation loop explicitly re-runs `resolvePosition(clientX, clientY)` and fires `select_to(newPosition)`, allowing the selection highlight to smoothly creep up line-by-line along with the scrolling text.

### 3. Rendering Unbounded Selections
To fix the disappearing highlights, we modified the `viewModel` so that `getCursorViewportPosition()` and `getAnchorViewportPosition()` never return `null`. Instead, they return genuine, unclipped relative line indices that are correctly negative (above viewport) or mathematically greater than the viewport boundaries.

We then refactored `buildSelectionRects()` to accept the `visibleLineCount` argument. The function now successfully computes the overlapping rectangular intersections between the actual viewport `[0, visibleLineCount - 1]` and the unbounded `startPos`/`endPos`. This guarantees perfectly robust highlight rendering no matter how far the user scrolls away from their initial click anchor.
