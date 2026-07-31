/** Fases del ciclo. El backend las nombra así en `app/domain/pomodoro.py`. */
export type PomodoroPhase = "focus" | "short_break" | "long_break";

/**
 * Estado del pomodoro tal y como lo emite el servidor (`PomodoroState.to_dict()`).
 *
 * El ciclo son 8 fases: los índices pares 0/2/4/6 son `focus`, los impares 1/3/5
 * son `short_break`, el 7 es `long_break`, y luego vuelve al 0.
 */
export interface PomodoroState {
  phase: PomodoroPhase;
  /** ISO 8601 con offset, generado con el reloj del SERVIDOR. */
  started_at: string;
  /** 1500 focus · 300 short_break · 900 long_break */
  duration_seconds: number;
  /** 0–7 */
  phase_index: number;
  /** UUID del owner que lo arrancó */
  started_by: string;
}

export const PHASES_PER_CYCLE = 8;

export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "Concentración",
  short_break: "Descanso corto",
  long_break: "Descanso largo",
};
