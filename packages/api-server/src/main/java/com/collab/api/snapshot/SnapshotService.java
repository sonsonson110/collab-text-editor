package com.collab.api.snapshot;

import com.collab.api.snapshot.entity.RoomSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Business logic for room snapshot persistence.
 *
 * <p>Provides upsert semantics: if a snapshot already exists for a room, its
 * {@code data} is overwritten in-place. If none exists, a new row is inserted.
 * This ensures at most one snapshot per room at any time.
 */
@Service
@Transactional(readOnly = true)
public class SnapshotService {

    private final RoomSnapshotRepository snapshotRepository;

    public SnapshotService(RoomSnapshotRepository snapshotRepository) {
        this.snapshotRepository = snapshotRepository;
    }

    /**
     * Persists or replaces the Yjs document snapshot for the given room.
     *
     * @param roomId The room whose document state is being saved.
     * @param data   Binary Yjs state produced by {@code Y.encodeStateAsUpdate(doc)}.
     */
    @Transactional
    public void upsertSnapshot(UUID roomId, byte[] data) {
        RoomSnapshot snapshot = snapshotRepository.findByRoomId(roomId)
                .orElse(RoomSnapshot.builder().roomId(roomId).build());
        snapshot.setData(data);
        snapshotRepository.save(snapshot);
    }

    /**
     * Returns the binary snapshot for the given room, if one exists.
     *
     * @param roomId The room to fetch.
     * @return The raw binary data, or {@link Optional#empty()} if no snapshot has been saved yet.
     */
    public Optional<byte[]> getSnapshot(UUID roomId) {
        return snapshotRepository.findByRoomId(roomId)
                .map(RoomSnapshot::getData);
    }
}
