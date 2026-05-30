# room.hurl — Tests for room endpoints (quickshare, claim, list, get by ID/slug)

# -----------------------------------------------------------------------
# Setup: Register two users — an owner and a second member for claim tests
# -----------------------------------------------------------------------
POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "test-room-owner-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Room Owner"
}
HTTP 201
[Captures]
room_owner_token: jsonpath "$.token"
room_owner_id: jsonpath "$.userId"

POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "test-room-claimer-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Room Claimer"
}
HTTP 201
[Captures]
room_claimer_token: jsonpath "$.token"

POST {{host}}/api/auth/guest
HTTP 200
[Captures]
guest_token: jsonpath "$.token"

# -----------------------------------------------------------------------
# POST /api/rooms/quickshare
# -----------------------------------------------------------------------

# Happy path: Member creates a quickshare room (claimed immediately)
POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{room_owner_token}}
HTTP 201
[Asserts]
jsonpath "$.id" != null
jsonpath "$.slug" != null
jsonpath "$.isClaimed" == true
jsonpath "$.accessMode" == "PUBLIC_EDIT"
[Captures]
member_room_id: jsonpath "$.id"
member_room_slug: jsonpath "$.slug"

# Happy path: Guest creates a quickshare room (unclaimed, expires in 24 h)
POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{guest_token}}
HTTP 201
[Asserts]
jsonpath "$.id" != null
jsonpath "$.slug" != null
jsonpath "$.isClaimed" == false
[Captures]
guest_room_id: jsonpath "$.id"
guest_creator_secret: jsonpath "$.creatorSecret"

# Auth guard: No token → 401
POST {{host}}/api/rooms/quickshare
HTTP 401

# -----------------------------------------------------------------------
# POST /api/rooms/{id}/claim
# -----------------------------------------------------------------------

# Happy path: Claimer claims the unclaimed guest room
POST {{host}}/api/rooms/{{guest_room_id}}/claim
Authorization: Bearer {{room_claimer_token}}
Content-Type: application/json
{
    "creatorSecret": "{{guest_creator_secret}}"
}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{guest_room_id}}"
jsonpath "$.isClaimed" == true

# Domain error: Room already claimed → 409
POST {{host}}/api/rooms/{{guest_room_id}}/claim
Authorization: Bearer {{room_owner_token}}
Content-Type: application/json
{
    "creatorSecret": "{{guest_creator_secret}}"
}
HTTP 409

# Auth guard: No token → 401
POST {{host}}/api/rooms/{{guest_room_id}}/claim
HTTP 401

# Auth guard: Guest token cannot claim (requires ROLE_AUTHENTICATED) → 403
POST {{host}}/api/rooms/{{member_room_id}}/claim
Authorization: Bearer {{guest_token}}
Content-Type: application/json
{
    "creatorSecret": "dummy-secret"
}
HTTP 403

# -----------------------------------------------------------------------
# GET /api/rooms — list rooms (requires ROLE_AUTHENTICATED)
# -----------------------------------------------------------------------

# Happy path: Owner sees only their own room in the list
GET {{host}}/api/rooms
Authorization: Bearer {{room_owner_token}}
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == "{{member_room_id}}"

# Auth guard: No token → 401
GET {{host}}/api/rooms
HTTP 401

# Auth guard: Guest cannot list rooms (requires ROLE_AUTHENTICATED) → 403
GET {{host}}/api/rooms
Authorization: Bearer {{guest_token}}
HTTP 403

# -----------------------------------------------------------------------
# GET /api/rooms/{id} — get room by UUID
# -----------------------------------------------------------------------

# Happy path: Owner fetches their own room
GET {{host}}/api/rooms/{{member_room_id}}
Authorization: Bearer {{room_owner_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{member_room_id}}"
jsonpath "$.slug" == "{{member_room_slug}}"
jsonpath "$.isClaimed" == true

# Happy path: Guest can fetch a public room
GET {{host}}/api/rooms/{{member_room_id}}
Authorization: Bearer {{guest_token}}
HTTP 200

# Auth guard: No token → 401
GET {{host}}/api/rooms/{{member_room_id}}
HTTP 401

# Domain error: Room not found → 404
GET {{host}}/api/rooms/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{room_owner_token}}
HTTP 404

# -----------------------------------------------------------------------
# GET /api/rooms/by-slug/{slug} — get room by slug
# -----------------------------------------------------------------------

# Happy path: Fetch room by its slug
GET {{host}}/api/rooms/by-slug/{{member_room_slug}}
Authorization: Bearer {{room_owner_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{member_room_id}}"
jsonpath "$.slug" == "{{member_room_slug}}"

# Happy path: Guest can fetch a public room by slug
GET {{host}}/api/rooms/by-slug/{{member_room_slug}}
Authorization: Bearer {{guest_token}}
HTTP 200

# Auth guard: No token → 401
GET {{host}}/api/rooms/by-slug/{{member_room_slug}}
HTTP 401

# Domain error: Unknown slug → 404
GET {{host}}/api/rooms/by-slug/this-slug-does-not-exist-{{suffix}}
Authorization: Bearer {{room_owner_token}}
HTTP 404
