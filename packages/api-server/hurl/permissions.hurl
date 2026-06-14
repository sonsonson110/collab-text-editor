# permissions.hurl — Tests for room permission endpoints

# -----------------------------------------------------------------------
# Setup: Register two users — an owner and an invitee
# -----------------------------------------------------------------------
POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "owner-perm-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Owner"
}
HTTP 201
[Captures]
owner_token: jsonpath "$.token"
owner_id: jsonpath "$.userId"

POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "invitee-perm-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Invitee"
}
HTTP 201
[Captures]
invitee_token: jsonpath "$.token"
invitee_id: jsonpath "$.userId"

POST {{host}}/api/auth/guest
HTTP 200
[Captures]
guest_token: jsonpath "$.token"

# Owner creates a room
POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{owner_token}}
HTTP 201
[Captures]
room_id: jsonpath "$.id"
room_slug: jsonpath "$.slug"

# -----------------------------------------------------------------------
# GET /api/rooms/by-slug/{slug}/ticket
# -----------------------------------------------------------------------

# Happy path: Owner gets an OWNER ticket
GET {{host}}/api/rooms/by-slug/{{room_slug}}/ticket
Authorization: Bearer {{owner_token}}
HTTP 200
[Asserts]
jsonpath "$.ticket" != null
[Captures]
owner_ticket: jsonpath "$.ticket"

# Happy path: Guest gets an EDITOR ticket (default room access is PUBLIC_EDIT)
GET {{host}}/api/rooms/by-slug/{{room_slug}}/ticket
Authorization: Bearer {{guest_token}}
HTTP 200

# -----------------------------------------------------------------------
# PATCH /api/rooms/{id}/access-mode
# -----------------------------------------------------------------------

# Domain error: Non-owner tries to change access mode -> 403
PATCH {{host}}/api/rooms/{{room_id}}/access-mode
Authorization: Bearer {{invitee_token}}
Content-Type: application/json
{
    "accessMode": "PRIVATE"
}
HTTP 403

# Happy path: Owner changes to PRIVATE
PATCH {{host}}/api/rooms/{{room_id}}/access-mode
Authorization: Bearer {{owner_token}}
Content-Type: application/json
{
    "accessMode": "PRIVATE"
}
HTTP 200

# Verify: Guest now gets 403 on private room
GET {{host}}/api/rooms/by-slug/{{room_slug}}/ticket
Authorization: Bearer {{guest_token}}
HTTP 403

# -----------------------------------------------------------------------
# POST /api/rooms/{id}/members
# -----------------------------------------------------------------------

# Happy path: Owner adds invitee as EDITOR
POST {{host}}/api/rooms/{{room_id}}/members
Authorization: Bearer {{owner_token}}
Content-Type: application/json
{
    "email": "invitee-perm-{{suffix}}@example.com",
    "role": "EDITOR"
}
HTTP 200
[Asserts]
jsonpath "$.role" == "EDITOR"

# Verify: Invitee can now get an EDITOR ticket
GET {{host}}/api/rooms/by-slug/{{room_slug}}/ticket
Authorization: Bearer {{invitee_token}}
HTTP 200

# -----------------------------------------------------------------------
# PATCH /api/rooms/{id}/members/{userId}
# -----------------------------------------------------------------------

# Happy path: Owner demotes invitee to VIEWER
PATCH {{host}}/api/rooms/{{room_id}}/members/{{invitee_id}}
Authorization: Bearer {{owner_token}}
Content-Type: application/json
{
    "role": "VIEWER"
}
HTTP 200
[Asserts]
jsonpath "$.role" == "VIEWER"

# -----------------------------------------------------------------------
# DELETE /api/rooms/{id}/members/{userId}
# -----------------------------------------------------------------------

# Happy path: Owner removes invitee
DELETE {{host}}/api/rooms/{{room_id}}/members/{{invitee_id}}
Authorization: Bearer {{owner_token}}
HTTP 200

# Domain error: Owner tries to demote themselves -> 400
PATCH {{host}}/api/rooms/{{room_id}}/members/{{owner_id}}
Authorization: Bearer {{owner_token}}
Content-Type: application/json
{
    "role": "VIEWER"
}
HTTP 400

# Domain error: Room Not Found -> 404
GET {{host}}/api/rooms/by-slug/invalid-slug-123/ticket
Authorization: Bearer {{owner_token}}
HTTP 404
