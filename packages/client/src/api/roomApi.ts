import { apiGet } from "./apiClient";
import type { RoomResponse } from "./types";

/**
 * Fetches all rooms the authenticated user is a member of.
 */
export async function fetchMyRooms() {
  return apiGet<RoomResponse[]>("/api/rooms");
}
