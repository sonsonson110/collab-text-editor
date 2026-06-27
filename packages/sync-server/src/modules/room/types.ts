import { WebSocket } from "ws";

export interface RoomState {
  connections: Set<WebSocket>;
  accessMode: string;
}

export interface Room extends RoomState {
  // `connections: Set<WebSocket>` and `accessMode: string` inherited from RoomState.
  // Note: doc and awareness are now managed by yjsService and presenceService.
}
