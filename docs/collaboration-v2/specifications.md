### Collaboration Editor — System Spec (Version: 0.3 - Quickshare Focus)

#### 1. Overview

A real-time collaborative text editor designed for **instant access**. Anyone can generate a room and start typing immediately without creating an account. Authenticated users (Members) gain the ability to "claim" these ephemeral rooms, persist history, and manage access controls.

#### 2. Core Concepts (New Paradigm)

* **Unclaimed Room (Ephemeral):** Created automatically when a Guest visits the landing page. It has no `owner_id`. By default, anyone with the link can edit it. The room data is automatically cleaned up (via a Scheduled Task) after 24 hours of inactivity.
* **Claimed Room (Persistent):** When a Guest decides to Sign Up or Log In, they can "Claim" the current Unclaimed Room. This room will then be assigned their `owner_id`, making it persist permanently and allowing them to configure custom access control settings.

#### 3. Roles

**Guest (Anonymous)**

* Assigned a Guest JWT (valid for 24 hours) upon their first visit to the application.
* Can initialize an **Unclaimed Room** with a single click.
* Can join and edit any Unclaimed Room (as long as they have the link).
* Has Read/Edit permissions (depending on the room's access link configuration) but cannot access the Room's settings page.

**Member (Authenticated)**

* Authenticated via Email/Password (or OAuth).
* Assigned a Member JWT.
* Can **Claim** an Unclaimed Room (converting it into their own persistent asset).
* Serves as the **Owner** of any rooms they create or have claimed. Has full administrative control over these rooms, including changing the Access Mode, deleting the room, and removing (kicking) participants.

#### 4. Session Initialization (The "Quickshare" Flow)

1. **Accessing the Landing Page (`/`):**

   * The Client checks `localStorage`. If no JWT is found, it calls `POST /api/auth/guest` to retrieve an anonymous Guest JWT.
   * The user clicks the "Share Code Now" button.
   * The Client calls `POST /api/rooms/quickshare` (attaching the Guest JWT in the request).
   * The Spring Boot API creates a new `Room` in the database with `owner_id = null`, `expires_at = now() + 24h`, and `access_mode = PUBLIC_EDIT`.
   * The API returns the `roomId`.
   * The Client redirects the user to `/room/{roomId}`.

2. **Accessing directly via a shared link (`/room/{id}`):**

   * User B receives a room link shared by User A.
   * Upon loading the page, the Client detects that no token is present and automatically requests a Guest JWT.
   * The WebSocket connection to the Sync Server is established, passing the Guest JWT. The Sync Server verifies the permissions and grants entry. User B can start typing and collaborating immediately.

#### 5. Room Access Settings (Updated)

* **Public Link (Default for Unclaimed Rooms):** Anyone who has the link can edit the document. Highly optimized for quick sharing.
* **Private / Restricted (Exclusive to Claimed Rooms):** After a Member claims a room, they can modify its Access Mode:
  * *View-only link:* Guests/others can view but not edit.
  * *Private:* Only specific invited users (stored in the `room_members` table) are permitted to join.

#### 6. Transition: From Guest to Member (Claiming)

The UI will always display a banner or button in the top bar: *"Sign in to save this room permanently"*.

1. A Guest is inside `/room/123` (an Unclaimed room) and clicks the sign-up/sign-in button.
2. The Client triggers `POST /api/auth/register` (or login) and receives a new Member JWT.
3. The Client persists the Member JWT and immediately sends a `POST /api/rooms/123/claim` request containing this Member JWT.
4. The Spring Boot API verifies if room `123` is currently unclaimed (i.e. `owner_id` is null). If so, it updates the database, setting `owner_id = {new_member_id}` and clearing `expires_at` (so it will not be deleted by the cleanup scheduled task).
5. The Client disconnects the existing WebSocket connection and reconnects using the Member JWT. The user seamlessly takes ownership of the room without losing any of their active code or editor state.

#### 7. API Endpoints (Redesigned Room Flow)

**Auth**

* `POST /api/auth/guest` — Returns an anonymous Guest JWT (valid for 24h). *(Unchanged)*
* `POST /api/auth/register` — Returns a Member JWT. *(Unchanged)*
* `POST /api/auth/login` — Returns a Member JWT. *(Unchanged)*

**Rooms**

* **`POST /api/rooms/quickshare`** (NEW) — Accepts either a Guest JWT or Member JWT. Returns the details of the newly created room (if created by a Guest, the `owner_id` is `null`).
* **`POST /api/rooms/:id/claim`** (NEW) — Requires a Member JWT. Claims an unclaimed room, making it owned by the authenticated member. Returns `403 Forbidden` if the room has already been claimed or if the user lacks permissions.
* `GET /api/rooms/:id` — Accepts any JWT (Guest or Member) to retrieve room metadata. The backend rejects the request if the room is `PRIVATE` and the requester is not authorized.
* `GET /api/rooms` — Requires a Member JWT. Retrieves the list of rooms owned by or shared with the authenticated user.
* `PATCH /api/rooms/:id/settings` — Requires the room Owner's JWT to update configuration.

#### 8. Database Changes (Notes for Spring Boot)

The `rooms` table needs to be restructured as follows to support this workflow:

* `id`: UUID (Primary Key).
* `slug`: String (Optional, if pretty URLs like `/room/john-doe-123` are desired instead of raw UUIDs).
* `owner_id`: UUID **(Nullable)**. Foreign key mapping to the `users` table. A `null` value indicates an Unclaimed Room.
* `access_mode`: Enum/String (e.g., `PUBLIC_EDIT`, `PUBLIC_VIEW`, `PRIVATE`).
* `expires_at`: Timestamp **(Nullable)**. Used by a Spring `@Scheduled` cron job to periodically scan and prune expired, unclaimed rooms. Once a room is claimed, this field is set to `null`.

#### 9. Sync Server (Node.js) Session Handling

The current WebSocket JWT verification flow is sound. The only addition is checking client capabilities:

* When a connection request is received, the Node.js server decodes the JWT to retrieve the user's `role` (Guest or Member) and `userId`.
* (Optional) The Sync Server can query the Spring Boot API (or check a cache/Redis) to determine the room's current `access_mode`.
* If `access_mode == PUBLIC_EDIT`, all operations are permitted from the Guest.
* If `access_mode == PUBLIC_VIEW`, the Guest's socket connection is marked as `read-only`. Any incoming Yjs update operations from this socket (except cursor positioning/awareness metadata) will be dropped.
