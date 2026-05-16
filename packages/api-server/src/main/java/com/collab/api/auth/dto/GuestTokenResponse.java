package com.collab.api.auth.dto;

/**
 * Response body for the {@code POST /api/auth/guest} endpoint.
 *
 * @param token   Signed guest JWT — valid for {@code app.jwt.guest-expiration-ms}.
 * @param guestId The randomly-generated guest identifier embedded as the JWT {@code sub} claim.
 */
public record GuestTokenResponse(String token, String guestId) {}
