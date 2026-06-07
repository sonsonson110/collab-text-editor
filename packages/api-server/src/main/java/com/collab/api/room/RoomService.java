package com.collab.api.room;

import com.collab.api.room.dto.QuickshareResponse;
import com.collab.api.room.dto.RoomResponse;
import com.collab.api.room.entity.AccessMode;
import com.collab.api.room.entity.Room;
import com.collab.api.room.entity.RoomMember;
import com.collab.api.room.entity.RoomRole;
import com.collab.api.shared.exception.ApiException;
import com.collab.api.shared.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Business logic for room creation, quickshare, claiming, and membership queries.
 *
 * <p>The class-level {@code @Transactional(readOnly = true)} sets the default
 * for all methods. Individual write methods override it with plain
 * {@code @Transactional} to allow DB mutations.
 */
@Service
@Transactional(readOnly = true)
public class RoomService {

    /** How long an unclaimed room survives before the cleanup task removes it. */
    private static final long UNCLAIMED_ROOM_TTL_HOURS = 24;

    /** Maximum slug generation attempts before giving up (collision guard). */
    private static final int MAX_SLUG_RETRIES = 10;

    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final SlugGenerator slugGenerator;

    public RoomService(
            RoomRepository roomRepository,
            RoomMemberRepository roomMemberRepository,
            SlugGenerator slugGenerator
    ) {
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.slugGenerator = slugGenerator;
    }

    /**
     * Creates a new room via the quickshare flow.
     *
     * <ul>
     *   <li>If the caller is an authenticated Member, the room is created as
     *       claimed immediately ({@code ownerId} set, {@code expiresAt = null},
     *       {@code creatorSecret = null}).</li>
     *   <li>If the caller is a Guest, the room is unclaimed ({@code ownerId = null},
     *       {@code expiresAt = now + 24h}) and a random {@code creatorSecret} is
     *       generated. The secret is returned only in this response — never in
     *       subsequent {@code GET} calls — so only the creating browser session
     *       can later trigger a claim.</li>
     * </ul>
     *
     * @param callerId The {@code sub} claim from the JWT (user UUID or guest ID string).
     * @param role     The {@code role} claim — {@link JwtService#ROLE_AUTHENTICATED}
     *                 or {@link JwtService#ROLE_GUEST}.
     * @return The created room as a {@link QuickshareResponse}.
     */
    @Transactional
    public QuickshareResponse createQuickshareRoom(String callerId, String role) {
        String slug = generateUniqueSlug();

        Room.RoomBuilder builder = Room.builder()
                .slug(slug)
                .accessMode(AccessMode.PUBLIC_EDIT);

        if (JwtService.ROLE_AUTHENTICATED.equals(role)) {
            UUID ownerId = UUID.fromString(callerId);
            builder.ownerId(ownerId).expiresAt(null);
            Room room = roomRepository.save(builder.build());

            RoomMember ownerMembership = RoomMember.builder()
                    .roomId(room.getId())
                    .userId(ownerId)
                    .role(RoomRole.OWNER)
                    .build();
            roomMemberRepository.save(ownerMembership);

            // Auth-user rooms are claimed immediately — no secret needed.
            return new QuickshareResponse(
                    room.getId(), room.getSlug(), room.getOwnerId(),
                    true, room.getAccessMode().name(), room.getCreatedAt(), null);
        } else {
            // Guest — unclaimed room: generate a creator secret so only this
            // browser session can later claim it.
            String secret = UUID.randomUUID().toString();
            builder.ownerId(null)
                   .creatorSecret(secret)
                   .expiresAt(Instant.now().plus(UNCLAIMED_ROOM_TTL_HOURS, ChronoUnit.HOURS));
            Room room = roomRepository.save(builder.build());
            return new QuickshareResponse(
                    room.getId(), room.getSlug(), null,
                    false, room.getAccessMode().name(), room.getCreatedAt(), secret);
        }
    }

    /**
     * Claims an unclaimed room on behalf of an authenticated member.
     *
     * <p>The caller must supply the {@code creatorSecret} that was returned at
     * quickshare time. This ensures only the browser session that created the
     * room can claim it — any other authenticated user is rejected with
     * {@code 403 FORBIDDEN}.
     *
     * <p>On success: sets {@code ownerId}, clears {@code expiresAt} (making the
     * room permanent), clears {@code creatorSecret} (one-time use), and
     * registers the member as {@code OWNER} in {@code room_members}.
     *
     * @param roomId         The room to claim.
     * @param userId         The authenticated member claiming the room.
     * @param providedSecret The secret presented by the client.
     * @return The updated room as a {@link RoomResponse}.
     * @throws ApiException {@code 404 NOT_FOUND}  if the room does not exist.
     * @throws ApiException {@code 409 CONFLICT}   if the room is already claimed.
     * @throws ApiException {@code 403 FORBIDDEN}  if the secret is missing or wrong.
     */
    @Transactional
    public RoomResponse claimRoom(UUID roomId, UUID userId, String providedSecret) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Room not found"));

        if (room.getOwnerId() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "Room is already claimed");
        }

        // Verify the one-time creator secret.
        if (room.getCreatorSecret() == null || !room.getCreatorSecret().equals(providedSecret)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Invalid or missing creator secret");
        }

        room.setOwnerId(userId);
        room.setExpiresAt(null);
        room.setCreatorSecret(null); // consume the one-time token
        roomRepository.save(room);

        RoomMember ownerMembership = RoomMember.builder()
                .roomId(roomId)
                .userId(userId)
                .role(RoomRole.OWNER)
                .build();
        roomMemberRepository.save(ownerMembership);

        return toResponse(room);
    }

    /**
     * Returns all rooms where the given user holds any membership role.
     *
     * @param userId The authenticated user's ID.
     */
    public List<RoomResponse> getRoomsForUser(UUID userId) {
        return roomRepository.findAllByMemberUserId(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Returns a single room by its UUID.
     *
     * <p>Access control:
     * <ul>
     *   <li>{@link AccessMode#PUBLIC_EDIT} and {@link AccessMode#PUBLIC_VIEW} — any
     *       authenticated requester (including guests) can retrieve metadata.</li>
     *   <li>{@link AccessMode#PRIVATE} — only room members are permitted.</li>
     * </ul>
     *
     * @param roomId      The room to fetch.
     * @param requesterId The {@code sub} claim from the requester's JWT.
     * @throws ApiException {@code 404 NOT_FOUND} if the room does not exist.
     * @throws ApiException {@code 403 FORBIDDEN} if the room is private and the
     *                      requester is not a member.
     */
    public RoomResponse getRoomById(UUID roomId, String requesterId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Room not found"));

        if (room.getAccessMode() == AccessMode.PRIVATE) {
            // For private rooms, only UUID-based member identities can be checked.
            // Guests (non-UUID sub claims) are always rejected.
            boolean isMember = tryParseUuid(requesterId)
                    .map(uid -> roomMemberRepository.existsByRoomIdAndUserId(roomId, uid))
                    .orElse(false);
            if (!isMember) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You are not a member of this room");
            }
        }

        return toResponse(room);
    }

    /**
     * Returns a single room by its slug.
     *
     * <p>Applies the same access control rules as {@link #getRoomById}.
     *
     * @param slug        The room's short URL slug.
     * @param requesterId The {@code sub} claim from the requester's JWT.
     * @throws ApiException {@code 404 NOT_FOUND} if no room has this slug.
     * @throws ApiException {@code 403 FORBIDDEN} if the room is private and the
     *                      requester is not a member.
     */
    public RoomResponse getRoomBySlug(String slug, String requesterId) {
        Room room = roomRepository.findBySlug(slug)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Room not found"));

        if (room.getAccessMode() == AccessMode.PRIVATE) {
            boolean isMember = tryParseUuid(requesterId)
                    .map(uid -> roomMemberRepository.existsByRoomIdAndUserId(room.getId(), uid))
                    .orElse(false);
            if (!isMember) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You are not a member of this room");
            }
        }

        return toResponse(room);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Maps a {@link Room} entity to its API projection. */
    private RoomResponse toResponse(Room room) {
        return new RoomResponse(
                room.getId(),
                room.getSlug(),
                room.getOwnerId(),
                room.getOwnerId() != null,
                room.getAccessMode().name(),
                room.getTitle(),
                room.getCreatedAt()
        );
    }

    /**
     * Generates a slug that does not already exist in the database.
     * Retries up to {@link #MAX_SLUG_RETRIES} times before throwing.
     */
    private String generateUniqueSlug() {
        for (int i = 0; i < MAX_SLUG_RETRIES; i++) {
            String candidate = slugGenerator.generate();
            if (!roomRepository.existsBySlug(candidate)) {
                return candidate;
            }
        }
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate a unique room slug");
    }

    /** Safely parses a UUID string, returning empty if parsing fails (e.g. for guest IDs). */
    private java.util.Optional<UUID> tryParseUuid(String value) {
        try {
            return java.util.Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException e) {
            return java.util.Optional.empty();
        }
    }
}
