import { TypedEventEmitter } from "./eventBus";
import {
  redis,
  redisSubscriber,
  REDIS_CHANNEL_ROOM_SYNC_PREFIX,
  NODE_ID,
} from "./redisClient";
import { logger } from "./logger";
import type { PermissionEvent } from "../types";

export const REDIS_CHANNEL_ROOM_PERMISSIONS = "room-permissions";

interface SyncPayload {
  nodeId: string;
  type: "doc" | "awareness";
  data: string;
}

function encodePayload(type: "doc" | "awareness", buffer: Uint8Array): string {
  const payload: SyncPayload = {
    nodeId: NODE_ID,
    type,
    data: Buffer.from(buffer).toString("base64"),
  };
  return JSON.stringify(payload);
}

function decodePayload(raw: string): SyncPayload | null {
  try {
    return JSON.parse(raw) as SyncPayload;
  } catch {
    return null;
  }
}

export function createRedisEventBridge(bus: TypedEventEmitter): void {
  // Listen to local events to broadcast to Redis
  bus.on("CROSS_NODE_BROADCAST", ({ roomId, type, buffer }) => {
    const channel = `${REDIS_CHANNEL_ROOM_SYNC_PREFIX}${roomId}`;
    redis.publish(channel, encodePayload(type, buffer)).catch((err: Error) => {
      logger.error(
        "RedisBridge",
        `Failed to publish ${type} update for room ${roomId}:`,
        err,
      );
    });
  });

  // Subscribe to room sync and permission channels
  redisSubscriber.psubscribe(`${REDIS_CHANNEL_ROOM_SYNC_PREFIX}*`, (err) => {
    if (err) {
      logger.error("RedisBridge", "Failed to psubscribe to room:sync:*:", err);
    } else {
      logger.info("RedisBridge", "Subscribed to room:sync:* channel pattern");
    }
  });

  redisSubscriber.subscribe(REDIS_CHANNEL_ROOM_PERMISSIONS, (err) => {
    if (err) {
      logger.error(
        "RedisBridge",
        `Failed to subscribe to ${REDIS_CHANNEL_ROOM_PERMISSIONS}:`,
        err,
      );
    } else {
      logger.info(
        "RedisBridge",
        `Subscribed to ${REDIS_CHANNEL_ROOM_PERMISSIONS} channel`,
      );
    }
  });

  redisSubscriber.on(
    "pmessage",
    (_pattern: string, channel: string, message: string) => {
      const roomId = channel.slice(REDIS_CHANNEL_ROOM_SYNC_PREFIX.length);

      const payload = decodePayload(message);
      if (!payload) {
        logger.warn(
          "RedisBridge",
          `Received invalid sync payload on channel: ${channel}`,
        );
        return;
      }

      if (payload.nodeId === NODE_ID) return; // Prevent echo loop

      const buffer = new Uint8Array(Buffer.from(payload.data, "base64"));

      if (payload.type === "doc") {
        bus.emit("INBOUND_SYNC_MESSAGE", {
          roomId,
          message: buffer,
          origin: "redis",
        });
      } else if (payload.type === "awareness") {
        bus.emit("INBOUND_AWARENESS_MESSAGE", {
          roomId,
          update: buffer,
          origin: "redis",
        });
      }
    },
  );

  redisSubscriber.on("message", (channel, message) => {
    if (channel !== REDIS_CHANNEL_ROOM_PERMISSIONS) return;

    let event: PermissionEvent;
    try {
      event = JSON.parse(message) as PermissionEvent;
    } catch (err) {
      logger.error(
        "RedisBridge",
        `Invalid JSON message on ${REDIS_CHANNEL_ROOM_PERMISSIONS}:`,
        err as Error,
      );
      return;
    }

    if (!event.roomId) {
      logger.warn("RedisBridge", "Missing roomId in permission event");
      return;
    }

    bus.emit("REDIS_PERMISSION_EVENT", {
      roomId: event.roomId,
      event,
    });
  });
}
