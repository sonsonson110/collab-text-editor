package com.collab.api.snapshot;

import com.collab.api.snapshot.entity.RoomSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Persistence port for {@link RoomSnapshot} entities.
 */
public interface RoomSnapshotRepository extends JpaRepository<RoomSnapshot, UUID> {

    /**
     * Returns the latest snapshot for the given room, if one exists.
     *
     * @param roomId The room's UUID.
     */
    Optional<RoomSnapshot> findByRoomId(UUID roomId);
}
