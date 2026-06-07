package com.collab.api.room.dto;

import com.collab.api.room.entity.AccessMode;
import com.collab.api.room.entity.Room;

import java.time.Instant;
import java.util.UUID;

/**
 * Read-only projection of a {@link Room} returned by the API.
 *
 * @param id         The room's unique identifier (UUID).
 * @param slug       Short URL-safe identifier used in client-side routes ({@code /room/<slug>}).
 * @param ownerId    UUID of the room owner, or {@code null} for unclaimed rooms.
 * @param isClaimed  {@code true} if the room has an owner (is permanent).
 * @param accessMode The room's current access control setting.
 * @param title      The human-readable title of the room, if set.
 * @param createdAt  When the room was created.
 */
public record RoomResponse(
        UUID id,
        String slug,
        UUID ownerId,
        boolean isClaimed,
        String accessMode,
        String title,
        Instant createdAt
) {}

