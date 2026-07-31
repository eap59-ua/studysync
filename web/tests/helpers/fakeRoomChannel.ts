import { vi } from "vitest";
import type { RoomChannel, RoomChannelSubscriber } from "@/hooks/useRoomChannel";
import type { WSMessage, WSStatus } from "@/hooks/useWebSocket";

export interface FakeRoomChannel extends RoomChannel {
  /** Simula un mensaje llegando por el socket. */
  emit: (msg: WSMessage) => void;
  send: RoomChannel["send"] & { mock: { calls: unknown[][] } };
}

/**
 * Canal de room falso para probar los hooks que cuelgan de él sin levantar un
 * WebSocket. Reparte a los suscriptores igual que el real.
 */
export function createFakeRoomChannel(status: WSStatus = "open"): FakeRoomChannel {
  const subscribers = new Set<RoomChannelSubscriber>();

  return {
    status,
    send: vi.fn() as FakeRoomChannel["send"],
    subscribe: (fn: RoomChannelSubscriber) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    emit: (msg: WSMessage) => {
      for (const fn of [...subscribers]) fn(msg);
    },
  };
}
