-- V5__create_room_snapshots.sql
-- Stores the binary Yjs document state for each room.
-- The sync-server periodically upserts this table so documents survive restarts.

CREATE TABLE IF NOT EXISTS room_snapshots
(
    id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id    UUID        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    data       BYTEA       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One snapshot per room; upsert on room_id replaces the existing row.
    CONSTRAINT uq_room_snapshots_room_id UNIQUE (room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_snapshots_room_id ON room_snapshots (room_id);
