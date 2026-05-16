# Phase 2: Stateless Authentication & Integration — Iteration Plan

> **Goal:** Replace the Phase-1 UUID session token with a signed JWT, integrate the token into the Node WebSocket server's handshake, and support guest sessions — so both services share the same stateless identity model without any per-request database calls.

---

## Iteration 1 — JWT Infrastructure

**Objective:** Add the JWT library and create the core signing/validation service before touching any controller or filter.

### Tasks

- [x] Add `jjwt` (Java JWT) dependencies to `pom.xml`:
  ```xml
  <dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.12.6</version>
  </dependency>
  <dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.12.6</version>
    <scope>runtime</scope>
  </dependency>
  <dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.12.6</version>
    <scope>runtime</scope>
  </dependency>
  ```
- [x] Add JWT config to `application.yaml`:
  ```yaml
  app:
    jwt:
      secret: <base64-encoded-256-bit-key>   # min 32 bytes for HS256
      expiration-ms: 3600000                  # 1 hour
      guest-expiration-ms: 86400000           # 24 hours for guest tokens
  ```
- [x] Create `shared/config/JwtProperties.java` — a `@ConfigurationProperties(prefix = "app.jwt")` record binding `secret`, `expirationMs`, and `guestExpirationMs`.
- [x] Create `shared/security/JwtService.java`:
  - `generateToken(User user)` → signs a JWT with `sub=userId`, `email`, `role=AUTHENTICATED`, and configurable expiry.
  - `generateGuestToken(String guestId)` → signs a token with `sub=guestId`, `role=GUEST`, no User record required.
  - `validateToken(String token)` → returns parsed claims or throws `ApiException(401)`.
  - `extractUserId(Claims claims)` → extracts `sub` as UUID string.
  - `extractRole(Claims claims)` → extracts the `role` claim.

### Spring Concepts

| Concept | ASP.NET Core Equivalent |
|---|---|
| `@ConfigurationProperties` | `IOptions<T>` bound from `appsettings.json` |
| `jjwt` `Jwts.builder()` | `System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler` |
| `SecretKeySpec` (HMAC-SHA256) | `SymmetricSecurityKey` + `HmacSha256` |

> **Security note:** The JWT secret must be at least 256 bits (32 bytes) for HS256 and must be identical in Spring and Node. Store it in an environment variable in production — never commit the raw value to source control.

---

## Iteration 2 — Replace BearerTokenFilter with JwtAuthenticationFilter

**Objective:** Swap the Phase-1 DB-lookup filter for a stateless JWT validation filter. No database call happens on every request.

### Tasks

- [x] Create `shared/security/JwtAuthenticationFilter.java` extending `OncePerRequestFilter`:
  - Read `Authorization: Bearer <token>` header.
  - Call `JwtService.validateToken(token)` — if invalid/expired, do nothing (Spring Security will reject downstream).
  - On success, build a `UsernamePasswordAuthenticationToken` with `sub` (userId or guestId) as the principal name and set it in `SecurityContextHolder`.
  - Do **not** hit the database.
- [x] Remove `BearerTokenFilter.java` and its `FilterRegistrationBean` from `SecurityConfig`.
- [x] Register `JwtAuthenticationFilter` in `SecurityConfig` at the same position:
  ```java
  .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
  ```
- [x] Add a Flyway migration `V3__remove_session_token_from_users.sql` to drop the now-unused `session_token` column and index.
- [x] Remove the `sessionToken` field from `User.java` and `findBySessionToken` from `UserRepository.java`.

### Spring Concepts

| Concept | ASP.NET Core Equivalent |
|---|---|
| `OncePerRequestFilter` | ASP.NET Core `IMiddleware` / request delegate |
| `SecurityContextHolder.getContext().setAuthentication(...)` | `HttpContext.User = new ClaimsPrincipal(...)` |
| Stateless validation (no DB) | JWT bearer handler in `AddAuthentication().AddJwtBearer()` |

> **Why no DB call:** The JWT is cryptographically self-contained. The signature guarantees authenticity; the expiry claim guarantees freshness. Hitting the DB on every request was a Phase-1 shortcut — it defeats the purpose of JWTs.

---

## Iteration 3 — Update AuthService to Issue JWTs

**Objective:** Wire `JwtService` into `AuthService` so that `register` and `login` now return real JWTs instead of UUID strings.

### Tasks

- [x] Inject `JwtService` into `AuthService`.
- [x] In `register`: replace `UUID.randomUUID().toString()` with `jwtService.generateToken(user)`.
- [x] In `login`: replace the UUID token with `jwtService.generateToken(user)`.
- [x] Since `login` no longer writes to the DB (no session token to persist), revert it to `@Transactional(readOnly = true)`.
- [x] Update existing `AuthControllerTest` helper `registerAndGetToken` — the token returned is now a JWT string, but the helper doesn't need to change since it just passes the token through.

### Spring Concepts

| Concept | ASP.NET Core Equivalent |
|---|---|
| `jwtService.generateToken(user)` | `tokenHandler.WriteToken(...)` from `JwtSecurityTokenHandler` |
| `@Transactional(readOnly = true)` on login | Query-only path, Hibernate skips dirty-checking flush |

---

## Iteration 4 — Guest Token Endpoint

**Objective:** Allow unauthenticated users to obtain a short-lived guest token so they can join rooms without registering. This is the "configure short-lived guest sessions" item from the roadmap.

### Tasks

- [x] Create `auth/dto/GuestTokenResponse.java` — `token`, `guestId`.
- [x] Add `POST /api/auth/guest` endpoint to `AuthController`:
  - Generates a random `guestId` (UUID string).
  - Calls `jwtService.generateGuestToken(guestId)`.
  - Returns `200 OK` + `GuestTokenResponse`.
  - This endpoint must be **public** — add it to the `permitAll` list in `SecurityConfig`.
- [x] Add `POST /api/auth/guest` to the `permitAll` list in `SecurityConfig`.

### Guest Token Claims Shape

```json
{
  "sub": "guest-<uuid>",
  "role": "GUEST",
  "iat": 1715000000,
  "exp": 1715086400
}
```

### Spring Concepts

| Concept | ASP.NET Core Equivalent |
|---|---|
| Public endpoint with `permitAll` | `[AllowAnonymous]` on controller method |
| Short-lived token with separate expiry | Token descriptor with custom `Expires` |

---

## Iteration 5 — Node WebSocket JWT Handshake

**Objective:** The Node sync-server validates the JWT from the WebSocket upgrade handshake using the shared secret, so it can authenticate connections without contacting Spring.

### Tasks

- [ ] Add the shared JWT secret to the Node server's environment (`.env` / `docker-compose`):
  ```env
  JWT_SECRET=<same base64 key as Spring>
  ```
- [ ] Install `jsonwebtoken` in the sync-server package:
  ```bash
  npm install jsonwebtoken
  ```
- [ ] Create `packages/sync-server/src/auth/jwtVerifier.ts`:
  - `verifyToken(token: string): { sub: string, role: string }` — validates signature + expiry, throws on failure.
- [ ] In the WebSocket upgrade handler, read the token from the URL query param (`?token=<jwt>`) or `Authorization` header:
  - If valid: allow the connection, attach `{ userId, role }` to the socket context.
  - If invalid or missing: close the connection with code `4401` (custom unauthorized code).
- [ ] Pass `role` from the JWT claims into the Yjs awareness fields so the editor UI can reflect permissions immediately (pre-Phase 4 foundation).

### Architecture Note

```
Client → WS Upgrade (token in query) → Node verifies JWT locally
                                          ↓ valid
                                       Connection accepted
                                          ↓ invalid
                                       Close(4401)
```

Node **never** calls Spring to validate a token. This is the key stateless benefit — Node remains independently deployable and testable.

### Node Concepts

| Concept | Spring Equivalent |
|---|---|
| `jsonwebtoken.verify(token, secret)` | `JwtService.validateToken(token)` |
| Custom WS close code `4401` | HTTP `401 Unauthorized` |
| Token in `?token=` query param | `Authorization: Bearer` header |

---

## Iteration 6 — Integration Tests

**Objective:** Update existing auth tests to account for JWT format and add guest token + Node auth tests.

### Tasks

- [ ] **Update `AuthControllerTest`** — all existing tests still pass since the token shape is opaque to the test helper. Verify explicitly:
  - `register_happyPath_returnsCreatedWithToken`: assert `$.token` matches JWT format (`^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$`).
  - `login_happyPath_returnsOkWithToken`: same assertion.
- [ ] **Add guest token tests to `AuthControllerTest`**:
  - `getGuestToken_happyPath_returnsOkWithToken` — no auth required, `200 OK`, token + guestId in body.
  - `getGuestToken_tokenIsJwtFormat` — assert returned token is parseable and contains `role=GUEST`.
- [ ] **Add `JwtServiceTest.java`** (plain JUnit, no Spring context):
  - `generateToken_validUser_returnsSignedJwt`
  - `validateToken_expiredToken_throwsApiException`
  - `validateToken_tamperedSignature_throwsApiException`
  - `generateGuestToken_returnsGuestRole`
- [ ] **Update `RoomControllerTest`** — the `registerAndGetToken` helper now returns a real JWT; the tests should still pass without changes since Bearer auth works the same way.

### Spring Testing Concepts

| Concept | ASP.NET Core Equivalent |
|---|---|
| Plain JUnit `JwtServiceTest` (no Spring context) | xUnit `[Fact]` with no `WebApplicationFactory` |
| `Jwts.parser().verifyWith(key).build().parseSignedClaims(token)` | `tokenHandler.ValidateToken(...)` |
| Regex assertion on JWT format in `MockMvc` | `Assert.Matches(pattern, value)` |

---

## Definition of Done for Phase 2

- [ ] `POST /api/auth/register` and `POST /api/auth/login` return signed JWTs (not UUID strings).
- [ ] `POST /api/auth/guest` returns a short-lived guest JWT with `role=GUEST`, no account required.
- [ ] The `session_token` column is removed from the database (V3 migration applied).
- [ ] Room endpoints authenticate via JWT with no database lookup per request.
- [ ] Node sync-server rejects WebSocket connections with invalid/missing JWTs (close code `4401`).
- [ ] Node sync-server accepts connections with valid JWTs and exposes `{ userId, role }` on the socket context.
- [ ] All existing integration tests still pass.
- [ ] New `JwtServiceTest` unit tests pass (no Spring context, fast).
- [ ] JWT secret is read from environment — not hardcoded anywhere in committed source.
