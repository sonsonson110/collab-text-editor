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

## 3. Styling & UI (Shadcn/Tailwind Preparation)

- **Utility-First:** Use Tailwind CSS for static, structural styling (layout, spacing, typography).
- **Dynamic Styles:** Use inline `style` ONLY for runtime-computed values (e.g., absolute cursor coordinates).
- **Class Merging:** Always use `clsx` (and prepare for `tailwind-merge`) when an element carries semantic class names alongside Tailwind utilities. Do not mix static CSS-in-JS and Tailwind on the same element.
