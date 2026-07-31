import { useCallback, useRef } from "react";
import { useWebSocket, type WSMessage, type WSStatus } from "./useWebSocket";

export type RoomChannelSubscriber = (msg: WSMessage) => void;

export interface RoomChannel {
  status: WSStatus;
  send: (msg: WSMessage) => void;
  /** Registra un consumidor. Devuelve la función para darse de baja. */
  subscribe: (fn: RoomChannelSubscriber) => () => void;
}

/**
 * Abre **un solo** WebSocket por room y reparte sus mensajes entre los
 * consumidores que se suscriban.
 *
 * Presencia y pomodoro cuelgan de aquí en vez de abrir cada uno su conexión.
 * Un socket por feature volvería a producir el bug de miembros duplicados que
 * se cerró en `c530db5`: el backend cuenta presencia por usuario, pero dos
 * conexiones del mismo usuario siguen siendo trabajo y ruido de reconexión
 * innecesarios.
 */
export function useRoomChannel(roomId: string): RoomChannel {
  const subscribersRef = useRef<Set<RoomChannelSubscriber>>(new Set());

  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/rooms/${roomId}`;

  const handleMessage = useCallback((msg: WSMessage) => {
    // Se copia antes de iterar: un suscriptor puede darse de baja al recibir
    // un mensaje, y mutar el Set durante el recorrido es un fallo silencioso.
    for (const fn of [...subscribersRef.current]) fn(msg);
  }, []);

  const { status, send } = useWebSocket(wsUrl, handleMessage);

  const subscribe = useCallback((fn: RoomChannelSubscriber) => {
    subscribersRef.current.add(fn);
    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  return { status, send, subscribe };
}
