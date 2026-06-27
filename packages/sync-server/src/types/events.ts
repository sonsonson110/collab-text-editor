import { WebSocket } from "ws";
import type { TicketClaims } from "../auth";

export interface PermissionEvent {
  type: "access_mode_changed" | "member_role_changed" | "member_removed";
  roomId: string;
  accessMode?: string;
  userId?: string;
  newRole?: string;
}

export interface EventMap {
  // Transport Layer
  CLIENT_CONNECTED: {
    roomId: string;
    connectionId: string;
    ws: WebSocket;
    claims: TicketClaims;
  };
  CLIENT_DISCONNECTED: { roomId: string; connectionId: string; ws: WebSocket };
  WS_MESSAGE_RECEIVED: {
    roomId: string;
    connectionId: string;
    ws: WebSocket;
    message: Uint8Array;
  };
  OUTBOUND_WS_BROADCAST: {
    roomId: string;
    message: Uint8Array;
    excludeWs?: WebSocket;
  };
  OUTBOUND_WS_SEND: { ws: WebSocket; message: Uint8Array };

  // Protocol Layer
  INBOUND_SYNC_MESSAGE: {
    roomId: string;
    connectionId?: string;
    ws?: WebSocket;
    message: Uint8Array;
    origin: "client" | "redis";
  };
  PERMITTED_SYNC_MESSAGE: {
    roomId: string;
    connectionId?: string;
    ws?: WebSocket;
    message: Uint8Array;
    origin: "client" | "redis";
  };
  INBOUND_AWARENESS_MESSAGE: {
    roomId: string;
    connectionId?: string;
    ws?: WebSocket;
    update: Uint8Array;
    origin: "client" | "redis";
  };

  // CRDT Engine
  DOC_UPDATED: {
    roomId: string;
    update: Uint8Array;
    origin: WebSocket | "redis";
  };
  SYNC_REPLY: { roomId: string; targetWs: WebSocket; message: Uint8Array };

  // Presence
  AWARENESS_UPDATED: {
    roomId: string;
    update: Uint8Array;
    origin: WebSocket | "redis";
  };

  // Room Lifecycle
  ROOM_CREATED: { roomId: string };
  ROOM_READY: { roomId: string };
  ROOM_TEARDOWN: { roomId: string };
  HYDRATE_DOC: { roomId: string; snapshot: Uint8Array };

  // Cross-Node / Redis
  CROSS_NODE_BROADCAST: {
    roomId: string;
    type: "doc" | "awareness";
    buffer: Uint8Array;
  };
  REDIS_PERMISSION_EVENT: { roomId: string; event: PermissionEvent };

  // Permission
  KICK_CONNECTION: { ws: WebSocket; code: number; reason: string };

  // Persistence
  SNAPSHOT_SAVED: { roomId: string; timestamp: number };
}
