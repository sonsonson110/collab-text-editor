# API Testing with Hurl

We use [Hurl](https://hurl.dev) for testing our Spring Boot API endpoints in a declarative, plain-text format. Hurl scripts act as E2E/integration tests verifying the full flow from HTTP request to database and back.

## Location
All API test scripts are located in `packages/api-server/hurl/`.

## Running Tests Locally
To run the test suite, ensure you have your development environment (PostgreSQL) running via Spring Boot's docker compose integration, then run:

```bash
npm run test:api
```

This script (`test-api.sh` in the root) automatically:
1. Validates that Hurl is installed.
2. Targets `http://localhost:8080` (can be overridden via the `API_HOST` environment variable).
3. Injects a randomized suffix into requests to prevent email/name collisions across multiple local runs.
4. Executes all `*.hurl` scripts in the `packages/api-server/hurl/` directory.

## Writing Tests
When adding new features or controllers, you must add Hurl tests.

1. **Controller Tests:** Create a dedicated `.hurl` file for your controller (e.g., `user.hurl`). Test valid paths (HTTP 200/201), validation errors (HTTP 400), and auth guards (HTTP 401).
2. **Common Flow:** If the new feature introduces a crucial user journey, update `flow_basic_room_management.hurl` (or create a new declarative `flow_*.hurl` script) to ensure the E2E scenario covers this flow.
3. **Collisions:** Always use `{{suffix}}` for unique fields like emails or usernames to prevent duplicate key errors during repeated manual tests.

Example:
```hurl
POST {{host}}/api/auth/register
{
    "email": "test-user-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Tester"
}
HTTP 201
```

## CI/CD Integration
The `.github/workflows/api-test.yml` workflow automatically runs the Hurl test suite on all Pull Requests and pushes to the `main` branch. It sets up PostgreSQL, launches the Spring Boot application, installs the Hurl CLI, and executes the suite. It will block the PR if any assertion fails.
