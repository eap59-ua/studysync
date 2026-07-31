import { useState, useEffect } from "react";
import type { RoomChannel } from "./useRoomChannel";
import type { User } from "../types/auth";

/**
 * Presencia del room. No abre socket propio: cuelga del canal compartido, que
 * es el mismo del que cuelga el pomodoro.
 */
export function useRoomPresence(channel: RoomChannel) {
  const [members, setMembers] = useState<User[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  const { subscribe } = channel;

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "user_joined") {
        setMembers((m) => {
          // Evitar duplicados
          if (m.find((u) => u.id === (msg.user as User).id)) return m;
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
    });
  }, [subscribe]);

  return { members, memberCount };
}
