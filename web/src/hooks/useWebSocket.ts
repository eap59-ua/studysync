import PartySocket from "partysocket";
import { useEffect, useRef, useState } from "react";
import { authStorage } from "../lib/storage";

export type WSMessage = { type: string; [key: string]: unknown };
export type WSStatus = "connecting" | "open" | "closed" | "reconnecting";

export function useWebSocket(url: string, onMessage: (msg: WSMessage) => void) {
  const [status, setStatus] = useState<WSStatus>(
    authStorage.getAccessToken() ? "connecting" : "closed"
  );
  const wsRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) {
      return;
    }

    // PartySocket expects a host, room, and can take query params.
    // If we have an absolute URL like ws://localhost:8000/api/v1/ws/rooms/123
    // Wait, the backend WebSocket URL might be generic. PartySocket is designed for PartyKit (host + room).
    // Let's use the underlying WebSocket directly if PartySocket's API is too specific to PartyKit,
    // or we can pass the full URL directly if partysocket allows.
    // PartySocket allows `host: string` and `path: string`.
    
    // Actually, partysocket supports `PartySocket` but maybe it's simpler to use standard WebSocket if the backend is standard FastAPI WebSocket.
    // However, the plan suggested:
    // const ws = new PartySocket({ host: new URL(url).host, room: url, query: { token } });
    // Let's check partysocket docs or just implement a robust native one.
    // Let's try PartySocket first, but configure it to connect to the exact URL.
    // PartySocket constructor takes `host`, `room`, `path`, `protocol`.
    // The easiest way to connect to a custom path is to use `path`.
    const parsedUrl = new URL(url);
    const host = parsedUrl.host;
    
    // It's safer to just provide the host and path.
    // Or just use the native WebSocket with a simple reconnect. Let's use PartySocket.
    const ws = new PartySocket({
      host: host,
      room: "default", // PartySocket requires a room, even if ignored by our backend
      path: parsedUrl.pathname.replace(/^\//, ""), // remove leading slash
      query: { token },
      // partysocket uses wss:// by default if host is not localhost.
    });

    wsRef.current = ws;

    ws.addEventListener("open", () => setStatus("open"));
    ws.addEventListener("close", () => setStatus("closed"));
    // PartySocket emits 'message' events like native WebSocket
    ws.addEventListener("message", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch {
        // Ignorar mensajes no JSON
      }
    });

    return () => {
      ws.close();
    };
  }, [url, onMessage]);

  const send = (msg: WSMessage) => {
    if (wsRef.current && status === "open") {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  return { status, send };
}
