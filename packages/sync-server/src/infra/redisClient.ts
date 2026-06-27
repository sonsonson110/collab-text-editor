import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { logger } from "./logger.js";

export const REDIS_CHANNEL_ROOM_SYNC_PREFIX = "room:sync:";
export const REDIS_KEY_ROOM_STATE_PREFIX = "room:state:";
export const REDIS_KEY_ROOM_UPDATES_PREFIX = "room:updates:";
export const REDIS_KEY_ROOM_CONNECTIONS_PREFIX = "room:connections:";
export const REDIS_KEY_ROOM_HEARTBEAT_PREFIX = "room:heartbeat:";

export const NODE_ID: string = randomUUID();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl);

redis.on("error", (err: Error) => {
  logger.error("Redis", "Client error:", err);
});

export const redisSubscriber = new Redis(redisUrl);

redisSubscriber.on("error", (err: Error) => {
  logger.error("Redis", "Subscriber error:", err);
});
