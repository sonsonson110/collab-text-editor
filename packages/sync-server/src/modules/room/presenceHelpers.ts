import {
  redis,
  REDIS_KEY_ROOM_CONNECTIONS_PREFIX,
} from "../../infra";
import { logger } from "../../infra";

export async function incrementPresence(roomId: string): Promise<void> {
  const key = `${REDIS_KEY_ROOM_CONNECTIONS_PREFIX}${roomId}`;
  await redis.incr(key).catch((err: Error) => {
    logger.error(
      "PresenceHelpers",
      `Failed to INCR presence counter for room ${roomId}:`,
      err,
    );
  });
}

export async function decrementPresence(roomId: string): Promise<number> {
  const key = `${REDIS_KEY_ROOM_CONNECTIONS_PREFIX}${roomId}`;
  try {
    return await redis.decr(key);
  } catch (err) {
    logger.error(
      "PresenceHelpers",
      `Failed to DECR presence counter for room ${roomId}:`,
      err as Error,
    );
    return -1; // Treat as non-empty
  }
}

export async function deletePresenceKey(roomId: string): Promise<void> {
  const key = `${REDIS_KEY_ROOM_CONNECTIONS_PREFIX}${roomId}`;
  await redis.del(key).catch((err: Error) => {
    logger.error(
      "PresenceHelpers",
      `Failed to DEL presence key for room ${roomId}:`,
      err,
    );
  });
}
