import {
  redis,
  REDIS_KEY_ROOM_UPDATES_PREFIX,
} from "../../infra/redisClient.js";
import { logger } from "../../infra/logger.js";

export async function appendDeltaToStream(
  roomId: string,
  delta: Uint8Array,
): Promise<void> {
  const key = `${REDIS_KEY_ROOM_UPDATES_PREFIX}${roomId}`;
  const data = Buffer.from(delta).toString("base64");
  await redis.xadd(key, "*", "data", data).catch((err: Error) => {
    logger.error(
      "StreamHelpers",
      `Failed to XADD delta to stream for room ${roomId}:`,
      err,
    );
  });
}

export async function readDeltasFromStream(
  roomId: string,
): Promise<Uint8Array[]> {
  const key = `${REDIS_KEY_ROOM_UPDATES_PREFIX}${roomId}`;
  try {
    const entries = await redis.xrange(key, "-", "+");
    return entries.map(([, fields]) => {
      const dataIndex = fields.indexOf("data");
      if (dataIndex === -1 || dataIndex + 1 >= fields.length) {
        return new Uint8Array(0);
      }
      return new Uint8Array(Buffer.from(fields[dataIndex + 1], "base64"));
    });
  } catch (err) {
    logger.error(
      "StreamHelpers",
      `Failed to XRANGE stream for room ${roomId}:`,
      err as Error,
    );
    return [];
  }
}

export async function trimStream(roomId: string): Promise<void> {
  const key = `${REDIS_KEY_ROOM_UPDATES_PREFIX}${roomId}`;
  await redis.xtrim(key, "MAXLEN", 0).catch((err: Error) => {
    logger.error(
      "StreamHelpers",
      `Failed to XTRIM stream for room ${roomId}:`,
      err,
    );
  });
}
