---
trigger: model_decision
description: When creating commits or preparing PRs.
---

# Git & Code Review Standards

## 1. Commit Quality

- **Atomic Commits:** One logical change per commit. Do not mix refactors, formatting, new features, and bug fixes in a single commit.
- **No Dead Code:** Unused imports, commented-out blocks, orphaned files, and `console.log` (unless intentional error logging) MUST be removed before committing.

## 2. Naming Conventions

- Variables and constants must be self-documenting. No generic names like `DATA` or `ITEMS`.
- Always use block braces for `if` bodies (e.g., `if (!x) { return; }`). Inline `if` returns are forbidden.
