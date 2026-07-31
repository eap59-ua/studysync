import { useCallback, useEffect, useState } from "react";
import type { RoomChannel } from "./useRoomChannel";
import { userService } from "../services/user.service";

/**
 * Contador personal de pomodoros completados.
 *
 * Se recarga al recibir un `pomodoro.phase_change` que cierre una fase de
 * foco, que es justo cuando el backend incrementa el contador. Cerrar un
 * descanso no suma nada, así que ahí no se pide.
 */
export function useUserPomodoroStats(channel: RoomChannel) {
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);

  const { subscribe } = channel;

  // Devuelve el número en vez de escribir el estado: así el setState vive en el
  // callback de la promesa y no en el cuerpo del efecto.
  const fetchCompleted = useCallback(async (): Promise<number> => {
    try {
      const stats = await userService.getStats();
      return stats.pomodoros_completed;
    } catch {
      // El contador es informativo: si falla, no se rompe la sala.
      return 0;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchCompleted().then((count) => {
      if (!cancelled) setPomodorosCompleted(count);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchCompleted]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "pomodoro.phase_change" && msg.from_phase === "focus") {
        fetchCompleted().then(setPomodorosCompleted);
      }
    });
  }, [subscribe, fetchCompleted]);

  return { pomodorosCompleted };
}
