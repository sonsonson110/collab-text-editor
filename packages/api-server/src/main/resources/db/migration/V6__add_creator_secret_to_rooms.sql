-- V6__add_creator_secret_to_rooms.sql
-- Adds a one-time opaque token to unclaimed rooms so that only the browser
-- session that created the room can trigger a claim.
--
-- Lifecycle:
--   - Set at quickshare time for guest-created rooms (auth-user rooms remain NULL).
--   - Verified and immediately cleared (set to NULL) on successful claim.
--   - Naturally expires when the unclaimed room is deleted by RoomCleanupTask.

ALTER TABLE rooms ADD COLUMN creator_secret VARCHAR(64);
