package com.collab.api.room;

import com.collab.api.room.dto.ClaimRequest;
import com.collab.api.room.dto.QuickshareResponse;
import com.collab.api.room.dto.RoomResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for room management endpoints.
 *
 * <p>This controller is intentionally thin — it resolves the authenticated
 * user's identity from the {@link Authentication} object (populated by
 * {@link com.collab.api.shared.security.JwtAuthenticationFilter}), delegates all
 * business logic to {@link RoomService}, and maps the result to HTTP responses.
 */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    /**
     * Creates a new room via the quickshare flow and returns its details.
     *
     * <p>Accepts both Guest JWTs ({@code role=GUEST}) and Member JWTs
     * ({@code role=AUTHENTICATED}). The service decides ownership and expiry
     * based on the caller's role. Guest-created rooms include a
     * {@code creatorSecret} in the response — auth-user-created rooms do not.
     *
     * @return {@code 201 Created} with the new room's details including its slug.
     */
    @PostMapping("/quickshare")
    public ResponseEntity<QuickshareResponse> quickshare(Authentication authentication) {
        String callerId = authentication.getName();
        String role = authentication.getAuthorities().iterator().next().getAuthority()
                .replace("ROLE_", "");
        QuickshareResponse response = roomService.createQuickshareRoom(callerId, role);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Claims an unclaimed room, assigning ownership to the authenticated member.
     *
     * <p>Requires a Member JWT ({@code role=AUTHENTICATED}). Guest tokens are rejected
     * with {@code 403 Forbidden}.
     *
     * <p>The request body must contain the {@code creatorSecret} returned at
     * quickshare time. Any other authenticated user presenting the wrong or
     * absent secret is rejected with {@code 403 Forbidden}.
     *
     * @return {@code 200 OK} with the updated room details.
     */
    @PostMapping("/{id}/claim")
    @PreAuthorize("hasRole('AUTHENTICATED')")
    public RoomResponse claimRoom(
            @PathVariable UUID id,
            @RequestBody ClaimRequest request,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        return roomService.claimRoom(id, userId, request.creatorSecret());
    }

    /**
     * Lists all rooms where the authenticated member holds any role.
     *
     * <p>Requires a Member JWT — guests do not have persistent room lists.
     *
     * @return {@code 200 OK} with the list of rooms.
     */
    @GetMapping
    @PreAuthorize("hasRole('AUTHENTICATED')")
    public List<RoomResponse> listRooms(Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        return roomService.getRoomsForUser(userId);
    }

    /**
     * Returns a single room by its UUID. Public rooms are accessible to all
     * authenticated requesters (including guests); private rooms enforce membership.
     *
     * @return {@code 200 OK} with the room details.
     */
    @GetMapping("/{id}")
    public RoomResponse getRoomById(
            @PathVariable UUID id,
            Authentication authentication
    ) {
        String requesterId = authentication.getName();
        return roomService.getRoomById(id, requesterId);
    }

    /**
     * Returns a single room by its URL slug. Applies the same access rules as
     * {@link #getRoomById}.
     *
     * @return {@code 200 OK} with the room details.
     */
    @GetMapping("/by-slug/{slug}")
    public RoomResponse getRoomBySlug(
            @PathVariable String slug,
            Authentication authentication
    ) {
        String requesterId = authentication.getName();
        return roomService.getRoomBySlug(slug, requesterId);
    }
    /**
     * Returns a WebSocket Room Ticket JWT for connecting to the sync-server.
     * Evaluates permissions based on AccessMode and RoomMember records.
     *
     * @return {@code 200 OK} with a JSON object containing the ticket.
     */
    @GetMapping("/by-slug/{slug}/ticket")
    public ResponseEntity<java.util.Map<String, String>> getRoomTicket(
            @PathVariable String slug,
            Authentication authentication
    ) {
        String requesterId = authentication.getName();
        String ticket = roomService.getRoomTicket(slug, requesterId);
        return ResponseEntity.ok(java.util.Map.of("ticket", ticket));
    }
}
