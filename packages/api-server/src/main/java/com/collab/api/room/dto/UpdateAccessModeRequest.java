package com.collab.api.room.dto;

import com.collab.api.room.entity.AccessMode;

public record UpdateAccessModeRequest(
        AccessMode accessMode
) {}
