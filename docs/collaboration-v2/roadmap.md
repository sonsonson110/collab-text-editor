### Phase 1: Database Schema & Core Quickshare API (Spring Boot)

**Goal:** Integrate the concept of "Unclaimed Rooms" into the system and allow Guests to create rooms.

1. **Database Migration (Create `V4__add_quickshare_fields.sql`):**

   * Modify the `rooms` table: Change the `owner_id` column to be `NULLABLE`.
   * Add `access_mode` column (VARCHAR/ENUM) with a default value of `PUBLIC_EDIT`.
   * Add `expires_at` column (TIMESTAMP) for temporary rooms.

2. **Update Entity & DTOs (`Room.java`, DTOs):**

   * Update the `Room.java` entity class to map to the new database columns.
   * Modify `RoomResponse` to return the new fields: `accessMode` and `isClaimed` status (determined by `owner_id != null`).

3. **Create API Endpoint `/api/rooms/quickshare` (`RoomController.java`, `RoomService.java`):**

   * Implement logic to handle quickshare requests (which do not require authentication or an `owner_id`).
   * Set `expires_at` to the current time plus 24 hours.
   * Save the new room to the database and return the generated `roomId`.

4. **Update API Endpoint `GET /api/rooms/:id`:**

   * Relax or remove the middleware/interceptor restriction that requires a valid Member identity.
   * Allow Guests (possessing a valid Guest JWT) to access the endpoint and retrieve room metadata if the room's `access_mode` is set to a public option (e.g., `PUBLIC_EDIT` or `PUBLIC_VIEW`).

### Phase 2: Claim Room Feature & Scheduled Cleanup (Spring Boot)

**Goal:** Enable users to claim and persist temporary rooms, and automatically clean up expired rooms.

1. **Claim Room API Endpoint (`POST /api/rooms/:id/claim`):**

   * Requires authentication via a Member JWT.
   * Logic: Locate the room by its ID -> Verify if `owner_id` is currently `null` -> If it is null, set `owner_id` to the ID of the authenticated user -> Clear the `expires_at` field (set to `null`) -> Add this user to the `room_members` table with the role of `OWNER`.

2. **Scheduled Database Cleanup (`RoomCleanupTask.java`):**

   * Create a scheduled task class annotated with `@Scheduled(cron = "0 0 * * * *")` (executing hourly or daily).
   * Query the database for rooms where `owner_id IS NULL` and `expires_at < NOW()`.
   * Delete these expired rooms from the database.

### Phase 3: Client-Side Quickshare Flow (React)

**Goal:** Allow users to visit the landing page and immediately begin typing code.

1. **Landing Page / "Share Code Now" Button:**

   * When the button is clicked, check `localStorage`. If no JWT is found, call `POST /api/auth/guest` to retrieve an anonymous Guest JWT.
   * Send a `POST /api/rooms/quickshare` request utilizing the acquired token.
   * Redirect the user's browser to `/room/{roomId}`.

2. **Direct Shared Link Entry (`/room/:id`):**

   * Inside the `CollaborationLayout.tsx` or `AppLayout.tsx` component, detect if the user accessed the URL without a token. Automatically call `POST /api/auth/guest` in the background to obtain a Guest JWT.
   * Use this token to call `GET /api/rooms/:id` to retrieve room details, then initialize `useCollaborativeEditor` (connecting via WebSocket).

3. **Room UI Updates:**

   * Display the room status (e.g., "Temporary / Unclaimed Room") if `owner_id` is null.

### Phase 4: Sync Server Upgrades (Node.js) & Claim Room UI Flow

**Goal:** Enforce connection security on the WebSocket server and complete the UX for transitioning from Guest to Member.

1. **Access Control on the Sync Server (`packages/sync-server/src/index.ts`):**

   * The Sync Server currently only verifies that the JWT is valid. Add a step: When a WebSocket connection request is received, query the Spring Boot API (or use an alternative mechanism, such as passing it in the JWT payload/claims) to check the room's `access_mode`.
   * If the room's access mode is `PUBLIC_VIEW` and the token belongs to a Guest, flag the connection socket as `readOnly: true`. Block all incoming Yjs document updates from this client.

2. **"Claim Room" UI Banner & Interaction (React):**

   * Add a prominent notification banner: *"You are editing as a Guest. Sign in to save this room permanently."*
   * When the user clicks "Sign In", display the Register/Login modal.
   * Upon successful authentication, call `POST /api/rooms/:id/claim`.
   * **Graceful Reconnection:** Disconnect the existing WebSocket provider (`provider.disconnect()`), re-initialize a new provider using the newly retrieved Member JWT as a query string parameter, and call `provider.connect()`. Ensure the local YDoc state is preserved throughout this swap.
