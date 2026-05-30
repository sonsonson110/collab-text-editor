package com.collab.api.room.dto;

/**
 * Request body for {@code POST /api/rooms/{id}/claim}.
 *
 * <p>The {@code creatorSecret} must match the value generated at quickshare
 * time and stored on the room. Presenting the wrong or absent secret results
 * in {@code 403 Forbidden}.
 *
 * @param creatorSecret The opaque one-time token returned in {@link QuickshareResponse}.
 */
public record ClaimRequest(String creatorSecret) {}
