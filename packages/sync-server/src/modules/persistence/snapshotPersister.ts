import { redis, REDIS_KEY_ROOM_STATE_PREFIX } from "../../infra";
import { logger } from "../../infra";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

if (!INTERNAL_API_SECRET) {
  throw new Error(
    "[snapshotPersister] INTERNAL_API_SECRET environment variable is not set. " +
      "Set it to the same value as APP_INTERNAL_API_SECRET on the api-server.",
  );
}

const internalHeaders: Record<string, string> = {
  "x-internal-secret": INTERNAL_API_SECRET,
};

export async function saveSnapshot(
  roomId: string,
  data: Uint8Array,
): Promise<void> {
  const url = `${API_BASE_URL}/api/internal/rooms/${roomId}/snapshot`;

  redis
    .set(`${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`, Buffer.from(data))
    .catch((err: unknown) => {
      logger.warn(
        "SnapshotPersister",
        `Failed to update Redis cache for room ${roomId}: ${err}`,
      );
    });

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...internalHeaders,
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(data),
    });

    if (!response.ok) {
      logger.error(
        "SnapshotPersister",
        `Failed to save snapshot for room ${roomId}: ${response.status}`,
      );
    }
  } catch (err) {
    logger.error(
      "SnapshotPersister",
      `Network error saving snapshot for room ${roomId}:`,
      err as Error,
    );
  }
}
