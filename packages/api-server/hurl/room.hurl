# room.hurl

# Setup: Register a user to own the rooms
POST {{host}}/api/auth/register
{
    "email": "test-room-owner-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Room Owner"
}
HTTP 201
[Captures]
room_owner_token: jsonpath "$.token"

# Unauthenticated: Try to create a room without token
POST {{host}}/api/rooms
{
    "name": "Anonymous Room"
}
HTTP 401

# Happy path: Create a room with valid token
POST {{host}}/api/rooms
Authorization: Bearer {{room_owner_token}}
{
    "name": "Hurl Test Room {{suffix}}"
}
HTTP 201
[Asserts]
jsonpath "$.id" != null
jsonpath "$.name" == "Hurl Test Room {{suffix}}"
[Captures]
created_room_id: jsonpath "$.id"

# Happy path: List rooms
GET {{host}}/api/rooms
Authorization: Bearer {{room_owner_token}}
HTTP 200
[Asserts]
jsonpath "$[0].id" != null

# Happy path: Get specific room by ID
GET {{host}}/api/rooms/{{created_room_id}}
Authorization: Bearer {{room_owner_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{created_room_id}}"
jsonpath "$.name" == "Hurl Test Room {{suffix}}"

# Unauthenticated: Try to get a room without token
GET {{host}}/api/rooms/{{created_room_id}}
HTTP 401
