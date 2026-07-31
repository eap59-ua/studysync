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

// Paleta del portfolio. Agrupados aquí a propósito: el Bloque 4 los mueve a
// variables CSS y así solo hay un sitio que tocar.
const PHASE_COLORS: Record<PomodoroPhase, string> = {
  focus: "#4F46E5",
  short_break: "#7C3AED",
  long_break: "#EC4899",
};

const IDLE_COLOR = "#9CA3AF";

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

  const color = state ? PHASE_COLORS[state.phase] : IDLE_COLOR;
  const phaseLabel = state ? PHASE_LABELS[state.phase] : "Sin pomodoro";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center gap-4">
      <h3 className="text-sm font-medium text-gray-900 self-start">Pomodoro</h3>

      <p className="text-sm font-medium" style={{ color }}>
        {phaseLabel}
      </p>

      {/* `tabular-nums` evita que los dígitos bailen de ancho en cada tick */}
      <p
        role="timer"
        aria-live="polite"
        aria-label={`Tiempo restante de ${phaseLabel.toLowerCase()}`}
        className="text-5xl font-bold tabular-nums tracking-tight"
        style={{ color }}
      >
        {formatMmSs(secondsRemaining)}
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
              style={{ backgroundColor: isCurrent ? color : "#E5E7EB" }}
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
