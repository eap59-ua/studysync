import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomChannel } from "./useRoomChannel";
import type { PomodoroState } from "../types/pomodoro";

export interface RoomPomodoro {
  state: PomodoroState | null;
  secondsRemaining: number;
  isRunning: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Fase vigente junto al desfase de reloj con el que hay que interpretarla.
 * Van juntos a propósito: el offset solo cambia cuando llega una fase nueva,
 * y separarlos permitiría renderizar una fase con el offset de otra.
 */
interface PomodoroSync {
  state: PomodoroState;
  /** Milisegundos que el reloj del servidor va por delante del cliente. */
  serverOffsetMs: number;
}

/**
 * Segundos que quedan de la fase actual.
 *
 * `started_at` viene del reloj del servidor, así que se compara contra la hora
 * del servidor estimada (`Date.now() + offset`), no contra la del navegador.
 * Se redondea hacia arriba para que el último segundo se vea como `00:01` y no
 * como `00:00` durante un segundo de más.
 */
function remainingSeconds({ state, serverOffsetMs }: PomodoroSync): number {
  const startedAtMs = new Date(state.started_at).getTime();
  const serverNowMs = Date.now() + serverOffsetMs;
  const remainingMs = state.duration_seconds * 1000 - (serverNowMs - startedAtMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Desfase medido contra un mensaje recién emitido por el servidor. */
function measureOffset(incoming: PomodoroState): number {
  return new Date(incoming.started_at).getTime() - Date.now();
}

/**
 * Pomodoro sincronizado del room. El servidor es la autoridad: este hook solo
 * renderiza lo que llega y hace la cuenta atrás visual. No calcula fases, no
 * decide transiciones y no persiste nada.
 *
 * Cuelga del canal compartido; no abre WebSocket propio.
 */
export function useRoomPomodoro(channel: RoomChannel): RoomPomodoro {
  const [sync, setSync] = useState<PomodoroSync | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Solo fuerza el repintado de la cuenta atrás una vez por segundo. */
  const [, setTick] = useState(0);

  /** Si el próximo `pomodoro.state` es el que se manda nada más conectar. */
  const awaitingFirstStateRef = useRef(true);

  const { subscribe, send, status } = channel;

  // Tras cada (re)conexión vuelve a esperarse un estado inicial. Importa para
  // la calibración de abajo: ese primero no sirve como referencia de reloj.
  useEffect(() => {
    if (status === "open") awaitingFirstStateRef.current = true;
  }, [status]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "pomodoro.state") {
        const incoming = msg.state as PomodoroState;
        // El `pomodoro.state` que llega al conectar puede traer una fase
        // empezada hace rato: no sirve para medir el desfase de relojes, solo
        // los mensajes recién emitidos valen. Calibrar con él dejaría la cuenta
        // atrás en la duración completa y cada cliente vería un número distinto.
        const fresh = !awaitingFirstStateRef.current;
        awaitingFirstStateRef.current = false;
        setSync((prev) => ({
          state: incoming,
          serverOffsetMs: fresh ? measureOffset(incoming) : (prev?.serverOffsetMs ?? 0),
        }));
        setError(null);
      } else if (msg.type === "pomodoro.phase_change") {
        // El servidor acaba de rotar la fase: siempre es recién emitido.
        const incoming = msg.state as PomodoroState;
        setSync({ state: incoming, serverOffsetMs: measureOffset(incoming) });
        setError(null);
      } else if (msg.type === "pomodoro.stopped") {
        setSync(null);
        setError(null);
      } else if (msg.type === "error") {
        setError((msg.message as string) ?? "Error del servidor");
      }
    });
  }, [subscribe]);

  // La cuenta atrás es un valor derivado de `sync` y del reloj, no un estado
  // propio: guardarla duplicaría la fuente de verdad. El intervalo solo obliga
  // a repintar; el número se recalcula en cada render.
  useEffect(() => {
    if (!sync) return;

    // Un tick por segundo: más resolución no aporta nada y multiplica renders.
    const id = setInterval(() => setTick((t) => t + 1), 1000);

    return () => clearInterval(id);
  }, [sync]);

  const start = useCallback(() => send({ type: "pomodoro.start" }), [send]);
  const stop = useCallback(() => send({ type: "pomodoro.stop" }), [send]);

  return {
    state: sync?.state ?? null,
    secondsRemaining: sync ? remainingSeconds(sync) : 0,
    isRunning: sync !== null,
    error,
    start,
    stop,
  };
}
