package com.collab.api.room;

import com.collab.api.room.entity.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Persistence port for {@link Room} entities.
 */
public interface RoomRepository extends JpaRepository<Room, UUID> {

    /**
     * Returns all rooms where the given user is a member (any role).
     * Joins through {@code room_members} to avoid loading membership data
     * for rooms the user cannot access.
     */
    @Query("""
            SELECT r FROM Room r
            WHERE EXISTS (
                SELECT 1 FROM RoomMember rm
                WHERE rm.roomId = r.id AND rm.userId = :userId
            )
            """)
    List<Room> findAllByMemberUserId(@Param("userId") UUID userId);

    /**
     * Looks up a room by its URL slug.
     *
     * @param slug The short alphanumeric slug (e.g. {@code "aB3dEf7g"}).
     */
    Optional<Room> findBySlug(String slug);

    /**
     * Checks whether a slug is already in use. Used by {@link SlugGenerator}
     * to guarantee uniqueness before inserting a new room.
     *
     * @param slug The candidate slug to check.
     */
    boolean existsBySlug(String slug);

    /**
     * Deletes all unclaimed rooms whose expiry timestamp has passed.
     * Called by the hourly {@link RoomCleanupTask}.
     *
     * @param cutoff Rooms with {@code expires_at} before this instant are deleted.
     * @return Number of rooms deleted.
     */
    @Modifying
    @Query("DELETE FROM Room r WHERE r.ownerId IS NULL AND r.expiresAt < :cutoff")
    int deleteExpiredUnclaimedRooms(@Param("cutoff") Instant cutoff);
}
