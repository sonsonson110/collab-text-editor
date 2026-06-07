/** API projection of a room, matching the Spring Boot RoomResponse record. */
export interface RoomResponse {
  id: string;
  slug: string;
  ownerId: string | null;
  isClaimed: boolean;
  accessMode: "PUBLIC_EDIT" | "PUBLIC_VIEW" | "PRIVATE";
  title: string | null;
  createdAt: string;
}

/**
 * Response returned exclusively by `POST /api/rooms/quickshare`.
 *
 * Extends the standard room fields with `creatorSecret` — a one-time opaque
 * token that must be presented when calling `POST /api/rooms/:id/claim`.
 * It is `null` for auth-user-created rooms (claimed immediately at creation).
 */
export interface QuickshareResponse extends RoomResponse {
  creatorSecret: string | null;
}
