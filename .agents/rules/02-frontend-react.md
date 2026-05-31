---
trigger: model_decision
description: When modifying files in packages/client/
---

# Frontend (React + TypeScript)

## 1. TypeScript Strictness

- **Interfaces over Types:** Use interfaces for object shapes that may be extended.
- **Strict Typing:** Prefer `unknown` over `any`. If a 3rd-party API forces `any`, wrap it in the thinnest possible typed abstraction.
- **No unsafe assertions:** No non-null assertions (`!`) unless accompanied by a comment proving the value exists.

## 2. React Components & State

- **Thin Components:** Extract complex logic into custom hooks. Component bodies should focus on rendering. Setup logic (providers, listeners, Yjs wiring) belongs in hooks (e.g., `useCollaborativeEditor`).
- **State Ownership:** Keep prop drilling shallow. Move state ownership to the layer that consumes it (e.g., ViewModel) instead of threading through intermediate components.

## 3. Styling & UI

### Component Directory Convention
There are **two distinct UI directories**. Never mix them:

| Directory | Purpose | Import from |
|---|---|---|
| `src/components/ui/` | shadcn primitives: `Button`, `Input`, `Dialog`, `Alert`, `Badge`, `Tooltip`, `Spinner`, etc. | `@/components/ui/<name>` |
| `src/components/theme/` | `ThemeProvider`, `ThemeToggle`, `useTheme` — light/dark mode infrastructure | `@/components/theme/<name>` |
| `src/ui/components/` | Editor-domain components: `Cursor`, `Gutter`, `Line`, `RemoteCursor`, `Scrollbar`, etc. | `@/ui/components` |
| `src/ui/templates/` | Page-level layout shells: `AppLayout`, `CollaborationLayout`, `SoloLayout` | `@/ui/templates/<name>` |

### shadcn / Radix
- This project uses **shadcn/ui** (style: `radix-nova`, Tailwind v4). All design system primitives come from `src/components/ui/`.
- To add a new component: `npx shadcn@latest add <component-name>` from `packages/client/`.
- The skill at `.agents/skills/shadcn` gives AI assistants full project-aware context — it runs `shadcn info --json` automatically.
- Do **not** manually edit generated files in `src/components/ui/`. Re-run the CLI instead.

### `cn()` Utility
- **Always use `cn()`** (from `@/lib/utils`) instead of bare `clsx()` when combining Tailwind classes. It runs through `tailwind-merge` to resolve conflicting utility classes.
- Use `cn()` for any className that mixes static and dynamic values.
- Inline `style` ONLY for runtime-computed values (e.g., absolute cursor coordinates, user colors).

### Theme System
- Theme is managed via `<ThemeProvider defaultTheme="system">` in `App.tsx`, wrapping the entire tree.
- `useTheme()` exposes `{ theme, setTheme, resolvedTheme }`.
- The `ThemeToggle` button (in `BottomBar`) cycles through `light → dark → system`.
- CSS variables for light mode are defined in `:root`, dark mode overrides in `.dark` in `src/index.css`.
- Editor-specific CSS vars (`--text-color`, `--background-color`, `--scrollbar-*`) are also split between `:root` (light) and `.dark` so the editor canvas responds to theme changes.
- Never hardcode `bg-neutral-950` or `text-white` for page backgrounds — use semantic tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `text-destructive`, etc.
