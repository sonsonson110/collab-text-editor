/** API projection of a room, matching the Spring Boot RoomResponse record. */
export interface RoomResponse {
  id: string;
  slug: string;
  ownerId: string | null;
  isClaimed: boolean;
  accessMode: "PUBLIC_EDIT" | "PUBLIC_VIEW" | "PRIVATE";
  createdAt: string;
}
