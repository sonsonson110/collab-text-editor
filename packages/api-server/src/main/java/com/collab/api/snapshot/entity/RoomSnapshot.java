package com.collab.api.snapshot.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Stores the latest binary Yjs document state for a room.
 *
 * <p>The sync-server periodically serialises the in-memory Yjs document using
 * {@code Y.encodeStateAsUpdate(doc)} and persists the result here. On restart,
 * the sync-server fetches this snapshot and applies it to a fresh Y.Doc before
 * accepting new WebSocket connections, ensuring document continuity across
 * process restarts.
 *
 * <p>There is at most one snapshot per room (enforced by the {@code UNIQUE}
 * constraint on {@code room_id}). The sync-server uses an upsert (PUT) to
 * overwrite the existing row rather than inserting a new one.
 */
@Entity
@Table(name = "room_snapshots")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** FK to the room this snapshot belongs to. */
    @Column(nullable = false, unique = true)
    private UUID roomId;

    /**
     * Raw binary Yjs state, encoded by {@code Y.encodeStateAsUpdate(doc)}.
     * Restored by {@code Y.applyUpdate(doc, data)} on the sync-server at room init.
     */
    @Column(nullable = false)
    private byte[] data;

    /** Automatically updated whenever this snapshot is overwritten. */
    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;
}
