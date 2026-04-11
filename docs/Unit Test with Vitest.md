# Unit Testing — Mental Model and Architecture

## What unit testing means for this project

A unit test isolates one piece of logic, feeds it known inputs, and asserts
known outputs — without touching the file system, the DOM, React, or any
other layer. Every test runs in milliseconds and can run thousands of times
without side effects.

This codebase is unusually well-suited for unit testing because the
architecture is already layered and pure. The core layer has zero UI
dependencies. The editor layer only depends on interfaces. The view layer
delegates cleanly. There is almost nothing to mock.

---

## Mental model: what to test and what not to test

```
Core   → test everything. Pure logic, no deps. Highest value.
Editor → test commands and cursor transitions. Mock IDocument.
View   → test viewport math and scroll logic. Mock IEditorState.
UI     → do NOT unit test. React components are integration territory.
```

The rule is simple: **if a function only takes values and returns values, test
it**. If it touches the DOM, React state, or browser APIs, leave it for
integration or end-to-end tests instead.

---

## What each layer tests

### Core — `Position`, `Range`, `LineIndex`, `Document`

These are pure value objects and algorithms. Every method has deterministic
output given its input. This is the most important layer to test because
everything else builds on top of it.

What to cover:

- `Position.isBefore / isAfter / isEqual` — all orderings including equal
- `Range` constructor — auto-normalises reversed start/end
- `Range.isEmpty / contains`
- `LineIndex.rebuild` — correct `lineStarts` array for various texts
- `LineIndex.positionToOffset / offsetToPosition` — round-trip fidelity
- `LineIndex.offsetToPosition` — boundary values: offset 0, last char, past end
- `Document.insert / delete / replace` — text mutations produce correct output
- `Document.getLineContent` — trims trailing `\n` correctly
- `Document.getLineLength` — correct for mid-document and last line
- `Document.getTextInRange` — slices text at correct offsets
- ...

### Editor — `Cursor`, `EditorState`

`Cursor` is a pure value object. `EditorState` requires a document — use the
real `Document` class (it has no side effects), not a mock.

What to cover:

- `Cursor.isCollapsed` — true when anchor === active
- `Cursor.getStart / getEnd` — correct regardless of selection direction
- `Cursor.toRange` — normalised range matches getStart/getEnd
- `Cursor.moveTo / setActive / collapseToStart / collapseToEnd`
- `EditorState.execute("insert_text")` — text inserted, cursor advanced
- `EditorState.execute("insert_text")` with selection — replaces selection
- `EditorState.execute("delete_backward")` — deletes char before cursor
- `EditorState.execute("delete_backward")` with selection — deletes selection
- `EditorState.execute("delete_forward")` — deletes char after cursor
- `EditorState.execute("move_cursor")` — left/right/up/down transitions
- `EditorState.execute("move_cursor")` at document boundaries — no-ops
- `EditorState.subscribe` — listener called after every execute
- ...

### View — `ViewModel`

Test the viewport math with a mock `IEditorState`. Viewport arithmetic is
the kind of off-by-one logic that fails silently in production.

What to cover:

- `getVisibleLines` — correct slice of lines for a given startLine
- `getViewportStart` — clamps when startLine exceeds document length
- `getViewportEnd` — does not exceed total line count
- `scrollDown / scrollUp` — correct startLine, clamped at boundaries
- `scrollToCursor` — cursor above viewport scrolls up to cursor line
- `scrollToCursor` — cursor below viewport scrolls down correctly
- `scrollToCursor` — no-op when cursor already visible
- `isCursorVisible` — true/false at exact boundary values
- `getCursorViewportPosition` — returns null when not visible, correct
  relative line when visible
- `subscribe` — delegates to editor's subscribe and returns its unsubscribe
- `execute` — delegates to editor's execute
- ...

---

## Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Test runner | **Vitest** | Not Jest. Vitest uses the same Vite config as the project. No separate Babel transform, no `moduleNameMapper` hacks for path aliases. `@/*` and `@core/*` just work. |
| Assertion library | Vitest built-in (`expect`) | Ships with Vitest. Identical API to Jest's `expect`. |
| Mock library | Vitest built-in (`vi.fn()`) | Same API as `jest.fn()`. Needed only for `IEditorState` stub in ViewModel tests. |
| React component testing | Skip for now | Add Vitest + `@testing-library/react` later as a separate concern. |

**Why not Jest?** Jest requires a custom transform (`ts-jest` or `babel-jest`)
and explicit `moduleNameMapper` entries to resolve the project's `@/*` path
aliases. Vitest reads `vite.config.ts` directly — the aliases already defined
there work in tests for free. For a Vite project, Vitest is strictly less
configuration.

---

## File structure

```
src/
  core/
    position/
      position.test.ts
      range.test.ts
    lines/
      lineIndex.test.ts
    document/
      document.test.ts
  editor/
    cursor/
      cursor.test.ts
    editorState.test.ts
  view/
    viewModel.test.ts
```

Test files live next to the source files they test. This is the standard
convention — it keeps imports short and makes it obvious when a file has no
tests.

> file structure might grow organically as tests are added. This is just a starting point.

---

## Configuration

### `vitest.config.ts` (new file at project root)

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
    },
  },
});
```

### `package.json` — add one script

```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run"
}
```

`vitest` (no arguments) runs in watch mode — reruns affected tests on every
file save. `vitest run` runs once and exits, useful for CI.

### Install

```bash
npm install -D vitest
```

That's the entire setup. No Babel, no `ts-jest`, no extra config.

---

## Test anatomy

Every test file follows this structure:

```ts
import { describe, it, expect } from "vitest";
import { Thing } from "./thing";

describe("Thing", () => {
  describe("methodName", () => {
    it("does X when given Y", () => {
      // Arrange
      const input = ...;

      // Act
      const result = thing.method(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

Three sections, always in this order:

- **Arrange** — set up the objects and inputs
- **Act** — call the one thing being tested
- **Assert** — make one or two assertions about the result

One behaviour per test. If the test name needs "and" in it, split it.

---

## Mocking — only where necessary

The core layer needs zero mocking. `Document`, `LineIndex`, `Position`, and
`Range` are self-contained.

The editor layer (`EditorState`) needs a `Document` instance — use the real
one. It has no side effects.

The view layer (`ViewModel`) needs an `IEditorState`. Use a minimal manual
stub rather than a full mock library:

```ts
function makeEditorStub(overrides: Partial<IEditorState> = {}): IEditorState {
  return {
    getCursor: () => new Cursor(new Position(0, 0)),
    getLineCount: () => 10,
    getLineContent: (line) => `Line ${line}`,
    execute: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    ...overrides,
  };
}
```

This pattern is more readable than `jest.mock(...)` for simple interfaces. It
keeps the test's intent visible — you can see exactly what the stub returns.

---

## What good coverage looks like

Coverage is a byproduct of good tests, not a goal. Aim to test:

1. The happy path — normal input produces expected output
2. Boundary values — empty string, offset 0, last line, column at end of line
3. Edge cases specific to the algorithm — reversed Range constructor,
   `scrollToCursor` when cursor is exactly at viewport boundary

Do not test:

- Private implementation details (internal `lineStarts` array shape)
- TypeScript types (the compiler handles those)
- React rendering (out of scope for unit tests)

---

## Running tests

```bash
npm test          # watch mode, reruns on save
npm run test:run  # single run, for CI
```

Output shows pass/fail per test, with diff on failure. Vitest also has a
browser UI (`vitest --ui`) that visualises results if preferred.