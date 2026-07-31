import { useCallback, useEffect, useRef, useState } from "react";
import { authStorage } from "../lib/storage";

export type WSMessage = { type: string; [key: string]: unknown };
export type WSStatus = "connecting" | "open" | "closed" | "reconnecting";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Hook genérico de WebSocket con reconexión automática (backoff exponencial).
 *
 * Usa el WebSocket nativo del navegador en lugar de PartySocket: PartySocket
 * está diseñado para PartyKit (host + room) y no encaja con un endpoint
 * arbitrario de FastAPI/Starlette.
 */
export function useWebSocket(url: string, onMessage: (msg: WSMessage) => void) {
  const [status, setStatus] = useState<WSStatus>(() =>
    authStorage.getAccessToken() ? "connecting" : "closed"
  );

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => void>(() => {});

  // Referencia estable a onMessage: evita recrear la conexión en cada render
  // cuando el consumidor pasa una función inline.
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = authStorage.getAccessToken();
    if (!token || unmountedRef.current) return;

    const separator = url.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${url}${separator}token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      retriesRef.current = 0;
      setStatus("open");
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;

      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("closed");
        return;
      }

      setStatus("reconnecting");
      const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current);
      retriesRef.current += 1;
      timerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connectRef.current();
      }, delay);
    };

    // onclose siempre se dispara después de onerror: la reconexión vive allí.
    ws.onerror = () => {};

    ws.onmessage = (e: MessageEvent) => {
      try {
        onMessageRef.current(JSON.parse(e.data));
      } catch {
        // Ignorar mensajes no JSON
      }
    };
  }, [url]);

  // Indirección por ref para que onclose pueda reintentar sin referenciar
  // `connect` dentro de su propia definición.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;
    retriesRef.current = 0;
    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { status, send };
}
