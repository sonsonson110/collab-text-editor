# flow_basic_room_management.hurl
# E2E Scenario: Register → Login → Quickshare room (as member) → Fetch by ID → Fetch by slug →
#               Guest quickshare → Member claims guest room → Verify list

# 1. Register a new user
POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "e2e-user-{{suffix}}@example.com",
    "password": "securepassword",
    "displayName": "E2E User"
}
HTTP 201

# 2. Login the user
POST {{host}}/api/auth/login
Content-Type: application/json
{
    "email": "e2e-user-{{suffix}}@example.com",
    "password": "securepassword"
}
HTTP 200
[Captures]
e2e_token: jsonpath "$.token"

# 3. Obtain a guest token for the guest-quickshare step
POST {{host}}/api/auth/guest
HTTP 200
[Captures]
e2e_guest_token: jsonpath "$.token"

# 4. Member creates a quickshare room (claimed, permanent)
POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{e2e_token}}
HTTP 201
[Asserts]
jsonpath "$.isClaimed" == true
jsonpath "$.accessMode" == "PUBLIC_EDIT"
[Captures]
e2e_room_id: jsonpath "$.id"
e2e_room_slug: jsonpath "$.slug"

# 5. Fetch the room by UUID
GET {{host}}/api/rooms/{{e2e_room_id}}
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{e2e_room_id}}"
jsonpath "$.slug" == "{{e2e_room_slug}}"
jsonpath "$.isClaimed" == true

# 6. Fetch the same room by slug
GET {{host}}/api/rooms/by-slug/{{e2e_room_slug}}
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{e2e_room_id}}"

# 7. Fetch the user's room list — should contain exactly the one room we created
GET {{host}}/api/rooms
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == "{{e2e_room_id}}"

# 8. Guest creates an unclaimed quickshare room
POST {{host}}/api/rooms/quickshare
Authorization: Bearer {{e2e_guest_token}}
HTTP 201
[Asserts]
jsonpath "$.isClaimed" == false
[Captures]
e2e_guest_room_id: jsonpath "$.id"

# 9. Member claims the guest's room
POST {{host}}/api/rooms/{{e2e_guest_room_id}}/claim
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{e2e_guest_room_id}}"
jsonpath "$.isClaimed" == true

# 10. Member's room list now includes both rooms
GET {{host}}/api/rooms
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$" count == 2
