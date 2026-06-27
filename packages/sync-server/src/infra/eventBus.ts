import { EventEmitter } from "node:events";
import type { EventMap } from "../types";
import { logger } from "./logger";

export class TypedEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    // Prevent MaxListenersExceededWarning
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void,
  ): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void,
  ): void {
    this.emitter.off(event, listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    try {
      this.emitter.emit(event, payload);
    } catch (err) {
      logger.error(
        "EventBus",
        `Error in listener for event ${event}`,
        err as Error,
      );
    }
  }
}

export function createEventBus(): TypedEventEmitter {
  return new TypedEventEmitter();
}
