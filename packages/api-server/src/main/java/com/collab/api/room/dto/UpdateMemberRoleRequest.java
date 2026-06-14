package com.collab.api.room.dto;

import com.collab.api.room.entity.RoomRole;

public record UpdateMemberRoleRequest(
        RoomRole role
) {}
