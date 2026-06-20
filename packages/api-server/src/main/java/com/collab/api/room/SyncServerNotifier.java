package com.collab.api.room;

import com.collab.api.shared.config.InternalApiProperties;
import com.collab.api.shared.config.SyncServerProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
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

    private static final Logger log = LoggerFactory.getLogger(SyncServerNotifier.class);
    private static final String INTERNAL_SECRET_HEADER = "x-internal-secret";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);

    private final HttpClient httpClient;
    private final String syncServerBaseUrl;
    private final String internalSecret;

    public SyncServerNotifier(
            SyncServerProperties syncServerProperties,
            InternalApiProperties internalApiProperties
    ) {
        this.syncServerBaseUrl = syncServerProperties.baseUrl();
        this.internalSecret = internalApiProperties.secret();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(REQUEST_TIMEOUT)
                .build();
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
                {"type":"access_mode_changed","accessMode":"%s"}
                """.formatted(newAccessMode).strip();
        postInternal(roomId, body, "access_mode_changed");
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
                {"type":"member_role_changed","userId":"%s","newRole":"%s"}
                """.formatted(targetUserId, newRole).strip();
        postInternal(roomId, body, "member_role_changed");
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
                {"type":"member_removed","userId":"%s"}
                """.formatted(targetUserId).strip();
        postInternal(roomId, body, "member_removed");
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
        String url = "%s/internal/rooms/%s/permission-changed".formatted(syncServerBaseUrl, roomId);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .header(INTERNAL_SECRET_HEADER, internalSecret)
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(REQUEST_TIMEOUT)
                    .build();

            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("[SyncServerNotifier] {} notification for room {} returned HTTP {}",
                        eventType, roomId, response.statusCode());
            } else {
                log.debug("[SyncServerNotifier] {} notified for room {}", eventType, roomId);
            }
        } catch (Exception e) {
            // Non-fatal: sync-server may be down or room not loaded. Change is already in DB.
            log.warn("[SyncServerNotifier] Failed to notify sync-server of {} for room {}: {}",
                    eventType, roomId, e.getMessage());
        }
    }
}
