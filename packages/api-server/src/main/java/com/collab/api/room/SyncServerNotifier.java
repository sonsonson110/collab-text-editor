package com.collab.api.room;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Fire-and-forget HTTP notifier that informs the sync-server of room permission changes.
 *
 * <p>The sync-server maintains in-memory room state (connected clients, Y.Doc, accessMode).
 * When the api-server mutates permissions, it must push the change to the sync-server so it
 * can immediately broadcast a {@code MSG_PERMISSION_CHANGED} WebSocket message to all
 * connected clients in the affected room — enabling real-time role enforcement without
 * requiring a client reconnect.
 *
 * <p>All methods are {@code @Async} (fire-and-forget). A failure to reach the sync-server
 * is logged as a warning but does not roll back the already-committed DB change. The
 * permission change will still take effect on the client's next WebSocket reconnect.
 *
 * <p>The internal secret header ({@code x-internal-secret}) reuses the same shared secret
 * used for sync-server → api-server snapshot calls, validated by the sync-server's
 * internal HTTP listener.
 */
@Service
public class SyncServerNotifier {

    /**
     * The Redis channel name used to broadcast room permission change events to the sync-server.
     */
    public static final String REDIS_CHANNEL_ROOM_PERMISSIONS = "room-permissions";

    /** Event type sent when a room's access mode changes. */
    public static final String EVENT_ACCESS_MODE_CHANGED = "access_mode_changed";

    /** Event type sent when a room member's role changes. */
    public static final String EVENT_MEMBER_ROLE_CHANGED = "member_role_changed";

    /** Event type sent when a room member is removed. */
    public static final String EVENT_MEMBER_REMOVED = "member_removed";

    private static final Logger log = LoggerFactory.getLogger(SyncServerNotifier.class);
    private final StringRedisTemplate redisTemplate;

    public SyncServerNotifier(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * Notifies the sync-server that the access mode of a room has changed.
     *
     * <p>The sync-server will update its in-memory room state and broadcast
     * {@code MSG_PERMISSION_CHANGED} with {@code type: "access_mode_changed"} to all
     * clients in the room, causing them to re-evaluate their effective role.
     *
     * @param roomId        The UUID of the affected room.
     * @param newAccessMode The new access mode string (e.g. {@code "PUBLIC_EDIT"}).
     */
    @Async
    public void notifyAccessModeChanged(UUID roomId, String newAccessMode) {
        String body = """
                {"type":"%s","roomId":"%s","accessMode":"%s"}
                """.formatted(EVENT_ACCESS_MODE_CHANGED, roomId, newAccessMode).strip();
        postInternal(roomId, body, EVENT_ACCESS_MODE_CHANGED);
    }

    /**
     * Notifies the sync-server that a specific member's role has changed.
     *
     * <p>The sync-server will find the connection(s) belonging to {@code targetUserId}
     * and send them a targeted {@code MSG_PERMISSION_CHANGED} with
     * {@code type: "member_role_changed"}, causing the client to re-evaluate its role.
     *
     * @param roomId       The UUID of the affected room.
     * @param targetUserId The UUID of the user whose role changed.
     * @param newRole      The new role string (e.g. {@code "VIEWER"}, {@code "EDITOR"}).
     */
    @Async
    public void notifyMemberRoleChanged(UUID roomId, UUID targetUserId, String newRole) {
        String body = """
                {"type":"%s","roomId":"%s","userId":"%s","newRole":"%s"}
                """.formatted(EVENT_MEMBER_ROLE_CHANGED, roomId, targetUserId, newRole).strip();
        postInternal(roomId, body, EVENT_MEMBER_ROLE_CHANGED);
    }

    /**
     * Notifies the sync-server that a member has been removed from the room.
     *
     * <p>The sync-server will find the connection(s) for {@code targetUserId} and close
     * them with WebSocket close code {@code 4403 (Forbidden)}, triggering a client-side
     * "You have been removed" banner. If the room's access mode is PRIVATE, any non-member
     * connection will also be closed.
     *
     * @param roomId       The UUID of the affected room.
     * @param targetUserId The UUID of the removed user.
     */
    @Async
    public void notifyMemberRemoved(UUID roomId, UUID targetUserId) {
        String body = """
                {"type":"%s","roomId":"%s","userId":"%s"}
                """.formatted(EVENT_MEMBER_REMOVED, roomId, targetUserId).strip();
        postInternal(roomId, body, EVENT_MEMBER_REMOVED);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Sends a POST to {@code /internal/rooms/{roomId}/permission-changed} on the sync-server.
     *
     * <p>Network errors and non-2xx responses are logged as warnings. This method is
     * intentionally non-throwing so a sync-server outage never surfaces as an api-server
     * error — the permission is already persisted in the DB.
     */
    private void postInternal(UUID roomId, String jsonBody, String eventType) {
        try {
            redisTemplate.convertAndSend(REDIS_CHANNEL_ROOM_PERMISSIONS, jsonBody);
            log.debug("[SyncServerNotifier] {} notified for room {}", eventType, roomId);
        } catch (Exception e) {
            log.warn("[SyncServerNotifier] Failed to notify sync-server of {} for room {}: {}",
                    eventType, roomId, e.getMessage());
        }
    }
}
