-- V4__quickshare_slug_and_fields.sql
-- Restructures the rooms table to support the Quickshare flow:
--   1. Replaces the 'name' column with a server-generated short slug.
--   2. Makes owner_id nullable so guest-created (unclaimed) rooms can exist.
--   3. Adds access_mode for future granular access control.
--   4. Adds expires_at for automatic cleanup of unclaimed rooms.

-- 1. Replace 'name' with a server-generated unique slug
ALTER TABLE rooms DROP COLUMN name;

-- Add slug column allowing nulls initially
ALTER TABLE rooms ADD COLUMN slug VARCHAR(12);

-- Populate existing rows with a random 8-character string to avoid unique constraint violations
UPDATE rooms SET slug = substring(md5(random()::text) from 1 for 8) WHERE slug IS NULL;

-- Enforce NOT NULL and UNIQUE
ALTER TABLE rooms ALTER COLUMN slug SET NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT uq_rooms_slug UNIQUE (slug);

-- 2. Make owner_id nullable for unclaimed (guest-created) rooms
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_owner_id_fkey;
ALTER TABLE rooms ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT rooms_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE;

-- 3. Access control mode (defaults to open editing for quickshare rooms)
ALTER TABLE rooms ADD COLUMN access_mode VARCHAR(20) NOT NULL DEFAULT 'PUBLIC_EDIT';
ALTER TABLE rooms ADD CONSTRAINT chk_rooms_access_mode
    CHECK (access_mode IN ('PUBLIC_EDIT', 'PUBLIC_VIEW', 'PRIVATE'));

-- 4. Expiry timestamp for unclaimed rooms (null = permanent/claimed)
ALTER TABLE rooms ADD COLUMN expires_at TIMESTAMPTZ;

-- Index for the hourly cleanup scheduled task — partial so it only covers expirable rows
CREATE INDEX idx_rooms_expires_at ON rooms (expires_at) WHERE expires_at IS NOT NULL;
