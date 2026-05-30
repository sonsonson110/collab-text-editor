# Lint Check After Code Generation

After generating or modifying any code in the `packages/client` codebase, you **must** run the lint check and fix all reported problems before declaring the work complete.

## Command

```bash
npm run lint --workspace=packages/client
```

Or from the repo root:

```bash
npm run lint
```

## What to fix

| Severity | Action |
|---|---|
| `error` | Must be fixed — the CI pipeline rejects the build |
| `warning` | Must be fixed — warnings indicate real code quality issues (unused directives, dead variables, etc.) |

## Common violations to watch for

- **`@typescript-eslint/no-unused-vars`** — Remove unused destructured props or variables rather than suppressing the rule. If the type contract requires the field, keep it in the interface/type but omit it from the destructure pattern.
- **Stale `// eslint-disable-next-line` directives** — ESLint will warn when a disable comment no longer suppresses anything. Remove it; do not replace it with a broader disable.
- **`react-hooks/exhaustive-deps`** — Resolve missing deps rather than disabling. Only suppress with a comment explaining *why* the dep is intentionally omitted, and only if the suppress is still active (i.e. ESLint would actually warn without it).

## Rule

Never leave a lint error or warning in committed code. Fix the root cause; do not add `// eslint-disable` comments as a workaround unless there is a documented, unavoidable reason.
