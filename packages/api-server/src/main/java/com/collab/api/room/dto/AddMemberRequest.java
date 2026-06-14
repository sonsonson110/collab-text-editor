package com.collab.api.room.dto;

import com.collab.api.room.entity.RoomRole;

public record AddMemberRequest(
        String email,
        RoomRole role
) {}
