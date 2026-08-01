import { Button } from "../ui/Button";
import type { RoomPomodoro } from "../../hooks/useRoomPomodoro";
import { PHASE_LABELS, PHASES_PER_CYCLE, type PomodoroPhase } from "../../types/pomodoro";

interface PomodoroPanelProps {
  pomodoro: RoomPomodoro;
  /** Solo el owner del room puede arrancar y parar (lo impone el backend). */
  isOwner: boolean;
  /** Contador personal acumulado, no el de esta sesión. */
  pomodorosCompleted?: number;
}

/**
 * Dos tonos por fase a propósito. El acento rosa cumple AA sobre blanco para
 * texto grande (3.53:1 ≥ 3) pero no para texto pequeño (< 4.5), así que la
 * cuenta atrás usa `display` y la etiqueta de fase `text`. En las otras dos
 * fases coinciden porque ya pasan de sobra.
 */
const PHASE_COLORS: Record<PomodoroPhase, { display: string; text: string }> = {
  focus: { display: "var(--color-primary)", text: "var(--color-primary)" },
  short_break: { display: "var(--color-secondary)", text: "var(--color-secondary)" },
  long_break: { display: "var(--color-accent)", text: "var(--color-accent-text)" },
};

const IDLE_COLORS = { display: "#9CA3AF", text: "#6B7280" };

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PomodoroPanel({
  pomodoro,
  isOwner,
  pomodorosCompleted = 0,
}: PomodoroPanelProps) {
  const { state, secondsRemaining, isRunning, error, start, stop } = pomodoro;

  const colors = state ? PHASE_COLORS[state.phase] : IDLE_COLORS;
  const phaseLabel = state ? PHASE_LABELS[state.phase] : "Sin pomodoro";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center gap-4">
      <h3 className="text-sm font-medium text-gray-900 self-start">Pomodoro</h3>

      <p className="text-sm font-medium" style={{ color: colors.text }}>
        {phaseLabel}
      </p>

      {/* `tabular-nums` evita que los dígitos bailen de ancho en cada tick.
          aria-live apagado: con "polite" el lector cantaría cada segundo. */}
      <p
        role="timer"
        aria-live="off"
        aria-label={`Tiempo restante de ${phaseLabel.toLowerCase()}`}
        className="text-5xl font-bold tabular-nums tracking-tight"
        style={{ color: colors.display }}
      >
        {formatMmSs(secondsRemaining)}
      </p>

      {/* Lo que sí merece anunciarse: cambia una vez por fase, no por tick */}
      <p role="status" className="sr-only">
        {isRunning
          ? `${phaseLabel}, ${Math.round((state?.duration_seconds ?? 0) / 60)} minutos`
          : "Pomodoro detenido"}
      </p>

      {/* Progreso del ciclo: 8 fases, la actual resaltada */}
      <ol className="flex items-center gap-2" aria-label="Progreso del ciclo">
        {Array.from({ length: PHASES_PER_CYCLE }, (_, index) => {
          const isCurrent = state?.phase_index === index;
          return (
            <li
              key={index}
              data-testid="cycle-dot"
              data-current={String(isCurrent)}
              className={`h-2 rounded-full transition-all ${isCurrent ? "w-4" : "w-2"}`}
              style={{ backgroundColor: isCurrent ? colors.display : "#E5E7EB" }}
            />
          );
        })}
      </ol>

      {!isRunning && (
        <p className="text-sm text-gray-500 text-center">
          {isOwner
            ? "Inicia un pomodoro para que la sala entera vaya al mismo ritmo."
            : "Todavía no hay ninguno en marcha. Solo el owner de la sala puede arrancarlo."}
        </p>
      )}

      {isOwner && (
        <div className="flex gap-2">
          {isRunning ? (
            <Button variant="secondary" onClick={stop}>
              Parar
            </Button>
          ) : (
            <Button onClick={start}>Iniciar</Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      <p
        data-testid="pomodoros-completed"
        className="text-xs text-gray-500 border-t border-gray-100 pt-3 w-full text-center"
      >
        Pomodoros completados:{" "}
        <span className="font-semibold text-gray-900">{pomodorosCompleted}</span>
      </p>
    </div>
  );
}
