package com.collab.api.room.entity;

/**
 * Controls who can access and edit a room.
 *
 * <ul>
 *   <li>{@link #PUBLIC_EDIT} — Default for quickshare rooms. Anyone with the link can edit.</li>
 *   <li>{@link #PUBLIC_VIEW} — Anyone with the link can read but not write.</li>
 *   <li>{@link #PRIVATE} — Only users listed in {@code room_members} are permitted.</li>
 * </ul>
 */
public enum AccessMode {
    PUBLIC_EDIT,
    PUBLIC_VIEW,
    PRIVATE
}
