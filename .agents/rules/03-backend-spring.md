---
trigger: model_decision
description: When modifying files in packages/api-server/
---

# Backend (Spring Boot)

## 1. Controller & Service Separation

- Controllers must only handle HTTP routing, DTO validation, and status codes.
- Business logic must reside in the `@Service` layer.

## 2. Error Handling

- Use the global `@ExceptionHandler` for consistent `ErrorResponse` formatting.
- Throw specific domain exceptions (e.g., `DuplicateResourceException` -> 409, `ResourceNotFoundException` -> 404).

## 3. Security

- Ensure all private endpoints properly validate JWT roles/permissions through the security filter chain.
