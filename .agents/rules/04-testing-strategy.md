---
trigger: model_decision
description: When adding new features, fixing bugs, or writing tests.
---

# Comprehensive Testing Strategy

## 1. Frontend Core Logic (Vitest)

- **Mandatory Business Logic Tests:** Any code related to the core business logic (`core/`, `editor/`, data transformations, cursor math) MUST have unit tests in a co-located `*.test.ts` file.
- **Pure Functions:** Core tests must run in isolation without React/DOM dependencies. Each `it()` block creates its own fixtures.

## 2. Spring Boot Integration Tests

- **No Slices:** Use `@SpringBootTest` with `@AutoConfigureMockMvc` and real PostgreSQL (no `@WebMvcTest` or H2 databases).
- **Test Isolation:** Use `@Transactional` on the test class for automatic rollback.
- **Mandatory Scenarios:** Every controller endpoint MUST test 4 paths:
  1. Happy Path (Valid input, expected HTTP status)
  2. Validation Failure (400 Bad Request)
  3. Auth Guard (401 Unauthorized)
  4. Domain Error (404 Not Found, 409 Conflict, etc.)

## 3. API E2E Testing (Hurl)

- Every new Spring Boot controller or major user journey must include declarative `.hurl` tests in `packages/api-server/hurl/`.
- Use interpolated variables (e.g., `{{suffix}}`) for idempotency during repeated CI runs.
