package com.collab.api.room.dto;

import java.time.Instant;
import java.util.UUID;

public record RoomMemberResponse(
        UUID id,
        UUID roomId,
        UUID userId,
        String email,
        String displayName,
        String role,
        Instant joinedAt
) {}
