import { redis, REDIS_KEY_ROOM_STATE_PREFIX } from "../../infra/redisClient.js";
import { TypedEventEmitter } from "../../infra/eventBus.js";
import { logger } from "../../infra/logger.js";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8081";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

if (!INTERNAL_API_SECRET) {
  throw new Error(
    "[snapshotHydrator] INTERNAL_API_SECRET environment variable is not set. " +
      "Set it to the same value as APP_INTERNAL_API_SECRET on the api-server.",
  );
}

const internalHeaders: Record<string, string> = {
  "x-internal-secret": INTERNAL_API_SECRET,
};

export async function fetchSnapshot(
  roomId: string,
): Promise<Uint8Array | null> {
  try {
    const cached = await redis.getBuffer(
      `${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`,
    );
    if (cached) {
      logger.info(
        "SnapshotHydrator",
        `Cache hit for room ${roomId} (${cached.byteLength} bytes)`,
      );
      return new Uint8Array(cached);
    }
  } catch (err) {
    logger.warn(
      "SnapshotHydrator",
      `Redis cache lookup failed for room ${roomId}: ${err}`,
    );
  }

  const url = `${API_BASE_URL}/api/internal/rooms/${roomId}/snapshot`;

  let response: Response;
  try {
    response = await fetch(url, { headers: internalHeaders });
  } catch (err) {
    logger.error(
      "SnapshotHydrator",
      `Network error fetching snapshot for room ${roomId}:`,
      err as Error,
    );
    return null;
  }

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    logger.error(
      "SnapshotHydrator",
      `Failed to fetch snapshot for room ${roomId}: ${response.status}`,
    );
    return null;
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);

  redis
    .set(`${REDIS_KEY_ROOM_STATE_PREFIX}${roomId}`, Buffer.from(data))
    .catch((err: unknown) => {
      logger.warn(
        "SnapshotHydrator",
        `Failed to cache snapshot in Redis for room ${roomId}: ${err}`,
      );
    });

  return data;
}

export function createSnapshotHydrator(bus: TypedEventEmitter): void {
  bus.on("ROOM_CREATED", async ({ roomId }) => {
    try {
      const snapshot = await fetchSnapshot(roomId);
      if (snapshot) {
        bus.emit("HYDRATE_DOC", { roomId, snapshot });
        logger.info(
          "SnapshotHydrator",
          `Hydrated room "${roomId}" from snapshot (${snapshot.byteLength} bytes)`,
        );
      }
    } catch (err) {
      logger.error(
        "SnapshotHydrator",
        `Failed to load snapshot for room "${roomId}":`,
        err as Error,
      );
    } finally {
      bus.emit("ROOM_READY", { roomId });
    }
  });
}
