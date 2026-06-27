import { WebSocket } from "ws";

export interface RoomState {
  connections: Set<WebSocket>;
  accessMode: string;
}

export type Room = RoomState;
