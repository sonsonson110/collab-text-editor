package com.collab.api.room.dto;

import com.collab.api.room.entity.Room;

import java.time.Instant;
import java.util.UUID;

/**
 * Response returned exclusively by {@code POST /api/rooms/quickshare}.
 *
 * <p>Extends the standard room projection with a {@code creatorSecret} field
 * that is only ever present for guest-created rooms. The secret is a one-time
 * opaque token the client must present when calling
 * {@code POST /api/rooms/{id}/claim}. It is absent from all {@code GET}
 * endpoints ({@link RoomResponse}) so that collaborators joining a room
 * cannot extract it from the network.
 *
 * @param id            The room's unique identifier.
 * @param slug          Short URL-safe slug used in client routes.
 * @param ownerId       UUID of the owner, or {@code null} for unclaimed rooms.
 * @param isClaimed     {@code true} when the room has a permanent owner.
 * @param accessMode    Current access control setting.
 * @param createdAt     When the room was created.
 * @param creatorSecret One-time claim token. {@code null} for auth-user-created
 *                      rooms (they are claimed immediately and need no secret).
 */
public record QuickshareResponse(
        UUID id,
        String slug,
        UUID ownerId,
        boolean isClaimed,
        String accessMode,
        Instant createdAt,
        String creatorSecret
) {}
