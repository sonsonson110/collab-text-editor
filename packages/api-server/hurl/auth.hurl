# auth.hurl

# Happy path: Register a new user
POST {{host}}/api/auth/register
{
    "email": "test-auth-register-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Auth Tester"
}
HTTP 201
[Asserts]
jsonpath "$.token" != null
jsonpath "$.userId" != null
jsonpath "$.displayName" == "Auth Tester"

# Validation failure: Register with bad email format
POST {{host}}/api/auth/register
{
    "email": "not-an-email",
    "password": "password123",
    "displayName": "Auth Tester"
}
HTTP 400
[Asserts]
jsonpath "$.status" == 400
jsonpath "$.message" == "Validation failed"

# Validation failure: Register with blank password
POST {{host}}/api/auth/register
{
    "email": "test-auth-bad-{{suffix}}@example.com",
    "password": "",
    "displayName": "Auth Tester"
}
HTTP 400

# Happy path: Login user
# First register a user to login with
POST {{host}}/api/auth/register
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Login Tester"
}
HTTP 201

# Now login
POST {{host}}/api/auth/login
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "password123"
}
HTTP 200
[Asserts]
jsonpath "$.token" != null
jsonpath "$.userId" != null

# Unauthorized: Wrong password
POST {{host}}/api/auth/login
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "wrongpassword"
}
HTTP 401

# Unauthorized: Unknown email
POST {{host}}/api/auth/login
{
    "email": "unknown-user-{{suffix}}@example.com",
    "password": "password123"
}
HTTP 401

# Happy path: Guest token
POST {{host}}/api/auth/guest
HTTP 200
[Asserts]
jsonpath "$.token" != null
jsonpath "$.guestId" != null
