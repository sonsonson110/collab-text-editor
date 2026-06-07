---
trigger: always_on
---

# AI Operating Directives

## 1. Context Gathering

- **Read the Docs:** Before proposing architecture changes or major feature implementations, you MUST review `docs/architecture.md` and relevant files in the `/docs` directory to align with the current system state.

## 2. Documentation Maintenance

- **Keep Docs Fresh:** If you implement a major feature, alter a data flow, or change the architecture, you MUST proactively update the relevant markdown files in `/docs` and the root `README.md`.
- **Self-Documenting Code:** Add `/** */` JSDoc comments to new exported functions, classes, interfaces, and complex constants. Describe *what* and *why*, not just the name. Preserve existing unrelated comments.

## 3. Post-Generation Verification

- **Lint Enforcement:** Never leave a lint error or warning in committed code. After generating frontend code, prompt the user to run `npm run lint --workspace=@myapp/client`. Fix root causes; do not use `// eslint-disable` unless strictly unavoidable and documented.
