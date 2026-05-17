# common_flow.hurl

# E2E Scenario: User registration, login, room creation, and fetching

# 1. Register a new user
POST {{host}}/api/auth/register
{
    "email": "e2e-user-{{suffix}}@example.com",
    "password": "securepassword",
    "displayName": "E2E User"
}
HTTP 201

# 2. Login the user
POST {{host}}/api/auth/login
{
    "email": "e2e-user-{{suffix}}@example.com",
    "password": "securepassword"
}
HTTP 200
[Captures]
e2e_token: jsonpath "$.token"

# 3. Create a Team Workspace room
POST {{host}}/api/rooms
Authorization: Bearer {{e2e_token}}
{
    "name": "Team Workspace {{suffix}}"
}
HTTP 201
[Captures]
e2e_room_id: jsonpath "$.id"

# 4. Fetch the room details
GET {{host}}/api/rooms/{{e2e_room_id}}
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
jsonpath "$.name" == "Team Workspace {{suffix}}"

# 5. Fetch the user's room list
GET {{host}}/api/rooms
Authorization: Bearer {{e2e_token}}
HTTP 200
[Asserts]
# Since we just created 1 room for this new user, the size should be exactly 1
jsonpath "$" count == 1
jsonpath "$[0].id" == "{{e2e_room_id}}"
