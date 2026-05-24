# snapshot.hurl — Tests for internal snapshot endpoints
# Secured by x-internal-secret header (ROLE_SERVICE), not by JWT.
# These endpoints are exclusively for the sync-server.

# -----------------------------------------------------------------------
# Auth guard: Missing secret → 401 on GET
# -----------------------------------------------------------------------
GET {{host}}/api/internal/rooms/00000000-0000-0000-0000-000000000001/snapshot
HTTP 401

# Auth guard: Missing secret → 401 on PUT
PUT {{host}}/api/internal/rooms/00000000-0000-0000-0000-000000000001/snapshot
Content-Type: application/octet-stream
hex,deadbeef;
HTTP 401

# Auth guard: Wrong secret → 401 on GET
GET {{host}}/api/internal/rooms/00000000-0000-0000-0000-000000000001/snapshot
x-internal-secret: wrong-secret
HTTP 401

# -----------------------------------------------------------------------
# Setup: create a real room to satisfy the room_snapshots FK constraint.
# We use a guest token so no user account is required.
# -----------------------------------------------------------------------
POST {{host}}/api/auth/guest
HTTP 200
[Captures]
snapshot_guest_token: jsonpath "$.token"

POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{snapshot_guest_token}}
HTTP 201
[Captures]
snapshot_room_id: jsonpath "$.id"

# -----------------------------------------------------------------------
# Happy path: GET snapshot for a room with no snapshot yet → 204 No Content
# -----------------------------------------------------------------------
GET {{host}}/api/internal/rooms/{{snapshot_room_id}}/snapshot
x-internal-secret: {{internal_secret}}
HTTP 204

# -----------------------------------------------------------------------
# Happy path: PUT snapshot (upsert) then GET it back
# -----------------------------------------------------------------------

# PUT — persist a binary snapshot for the room
PUT {{host}}/api/internal/rooms/{{snapshot_room_id}}/snapshot
Content-Type: application/octet-stream
x-internal-secret: {{internal_secret}}
hex,deadbeef;
HTTP 200

# GET — retrieve the snapshot we just stored
GET {{host}}/api/internal/rooms/{{snapshot_room_id}}/snapshot
x-internal-secret: {{internal_secret}}
HTTP 200
[Asserts]
header "Content-Type" contains "application/octet-stream"
bytes == hex,deadbeef;
