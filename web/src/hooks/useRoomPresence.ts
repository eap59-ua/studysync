import { useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import type { User } from "../types/auth";

export function useRoomPresence(roomId: string) {
  const [members, setMembers] = useState<User[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/rooms/${roomId}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMessage = useCallback((msg: any) => {
    if (msg.type === "user_joined") {
      setMembers((m) => {
        // Evitar duplicados
        if (m.find((u) => u.id === msg.user.id)) return m;
        return [...m, msg.user as User];
      });
      if (msg.count !== undefined) setMemberCount(msg.count as number);
    } else if (msg.type === "user_left") {
      setMembers((m) => m.filter((u) => u.id !== (msg.user as User).id));
      if (msg.count !== undefined) setMemberCount(msg.count as number);
    } else if (msg.type === "presence_state") {
      // Estado inicial enviado al conectar. Se deduplica por id aunque el
      // backend ya lo haga: un cliente no debe fiarse de eso para renderizar.
      if (msg.members) {
        const unique = Array.from(
          new Map((msg.members as User[]).map((u) => [u.id, u])).values()
        );
        setMembers(unique);
      }
      if (msg.count !== undefined) setMemberCount(msg.count as number);
    }
  }, []);

  const { status, send } = useWebSocket(wsUrl, handleMessage);

  return { status, members, memberCount, send };
}
