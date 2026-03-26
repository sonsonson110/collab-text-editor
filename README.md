> More in ./docs

Live demo: <https://educational-text-editor.web.app/>

---

# Editor Roadmap

## Input completeness

- [x] Mouse click moves cursor to clicked position
- [x] Mouse drag creates a text selection
- [x] Mouse wheel scrolls viewport (smooth, scaled to delta)
- [ ] Double-click selects the word under the cursor
- [ ] Triple-click selects the entire line
- [ ] Shift + click extends the selection from the current anchor
- [ ] Shift + arrow keys extend the selection
- [ ] Ctrl/Cmd + A selects all text
- [ ] Home / End keys move cursor to start / end of line
- [ ] Ctrl/Cmd + Home / End moves cursor to start / end of document

---

## Clipboard

- [ ] Ctrl/Cmd + C copies selected text to clipboard
- [ ] Ctrl/Cmd + X cuts selected text
- [ ] Ctrl/Cmd + V pastes from clipboard, replacing any active selection

---

## Undo / Redo

- [ ] Each command pushed onto a history stack as a reversible entry
- [ ] Ctrl/Cmd + Z undoes the last command
- [ ] Ctrl/Cmd + Shift + Z (or Ctrl + Y) redoes
- [ ] Undo/redo history cleared on document reset
- [ ] Consecutive character inserts collapsed into a single undo step

---

## Line numbers

- [x] Gutter renders the line number for each visible line
- [x] Gutter width adjusts when line count exceeds one digit boundary (9→10, 99→100)
- [x] Clicking a line number selects the entire line

---

## Syntax highlighting

- [ ] Tokeniser runs over visible lines only (not the full document)
- [ ] `ViewLine` carries a `tokens` array instead of a plain `content` string
- [ ] `Line` component renders token spans with colour classes
- [ ] At minimum: keywords, strings, comments, numbers distinguished
- [ ] Tokeniser is swappable per language without touching the render layer

---

## Search

- [ ] Ctrl/Cmd + F opens a find bar
- [ ] All matches in the document highlighted
- [ ] Enter / Shift + Enter cycles forward / backward through matches
- [ ] Active match distinguished from passive matches
- [ ] Escape closes the find bar and restores normal cursor state
- [ ] Find + replace: replace one, replace all

---

## Viewport and scroll

- [ ] Viewport height derived from container size, not a hardcoded line count
- [ ] Window resize updates `visibleLineCount` automatically
- [ ] Scroll position preserved across edits unless cursor forces a scroll

---

## Performance and state correctness

- [ ] `LineIndex` updates incrementally (only rebuild affected region, not full text)
- [ ] `ViewModel.getVisibleLines` returns a stable array reference when nothing changed (avoids React re-render)
- [ ] Large documents (10 000+ lines) do not degrade input latency

---

## Polish

- [ ] Cursor blink animation
- [ ] Selection rendered as a highlight layer behind text
- [ ] Scroll-follow cursor respects a small deadzone (does not re-centre on every keystroke)
- [ ] Tab key inserts configurable spaces (default 2)
- [ ] Auto-indent: Enter preserves the indentation of the current line
