# auth.hurl — Tests for POST /api/auth/register, /login, /guest

# Happy path: Register a new user
POST {{host}}/api/auth/register
Content-Type: application/json
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
Content-Type: application/json
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
Content-Type: application/json
{
    "email": "test-auth-bad-{{suffix}}@example.com",
    "password": "",
    "displayName": "Auth Tester"
}
HTTP 400

# Domain error: Duplicate email
POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "test-auth-register-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Another Tester"
}
HTTP 409

# Setup: Register a user to test login with
POST {{host}}/api/auth/register
Content-Type: application/json
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "password123",
    "displayName": "Login Tester"
}
HTTP 201

# Happy path: Login
POST {{host}}/api/auth/login
Content-Type: application/json
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "password123"
}
HTTP 200
[Asserts]
jsonpath "$.token" != null
jsonpath "$.userId" != null
jsonpath "$.displayName" == "Login Tester"

# Auth guard: Login with wrong password
POST {{host}}/api/auth/login
Content-Type: application/json
{
    "email": "test-login-{{suffix}}@example.com",
    "password": "wrongpassword"
}
HTTP 401

# Domain error: Login with unknown email
POST {{host}}/api/auth/login
Content-Type: application/json
{
    "email": "unknown-user-{{suffix}}@example.com",
    "password": "password123"
}
HTTP 401

# Happy path: Issue a guest token (public endpoint — no auth required)
POST {{host}}/api/auth/guest
HTTP 200
[Asserts]
jsonpath "$.token" != null
jsonpath "$.guestId" != null
