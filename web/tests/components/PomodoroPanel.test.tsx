import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PomodoroPanel } from "@/components/rooms/PomodoroPanel";
import type { RoomPomodoro } from "@/hooks/useRoomPomodoro";
import type { PomodoroState } from "@/types/pomodoro";

function makePomodoro(overrides: Partial<RoomPomodoro> = {}): RoomPomodoro {
  return {
    state: null,
    secondsRemaining: 0,
    isRunning: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function makeState(overrides: Partial<PomodoroState> = {}): PomodoroState {
  return {
    phase: "focus",
    started_at: "2026-07-31T12:00:00.000Z",
    duration_seconds: 1500,
    phase_index: 0,
    started_by: "owner-id",
    ...overrides,
  };
}

describe("PomodoroPanel", () => {
  it("muestra 00:00 y el estado vacío cuando no hay pomodoro activo", () => {
    render(<PomodoroPanel pomodoro={makePomodoro()} isOwner={false} />);

    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  });

  it("invita al owner a arrancarlo cuando no hay ninguno activo", () => {
    render(<PomodoroPanel pomodoro={makePomodoro()} isOwner={true} />);

    expect(screen.getByText(/Inicia un pomodoro/i)).toBeInTheDocument();
  });

  it("le dice al no-owner que espere, sin ofrecerle controles", () => {
    render(<PomodoroPanel pomodoro={makePomodoro()} isOwner={false} />);

    expect(screen.getByText(/owner/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Iniciar/i })).not.toBeInTheDocument();
  });

  it("pinta la cuenta atrás en mm:ss", () => {
    const pomodoro = makePomodoro({
      state: makeState(),
      secondsRemaining: 754, // 12:34
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(screen.getByRole("timer")).toHaveTextContent("12:34");
  });

  it("rellena con ceros por debajo de un minuto", () => {
    const pomodoro = makePomodoro({
      state: makeState(),
      secondsRemaining: 5,
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(screen.getByRole("timer")).toHaveTextContent("00:05");
  });

  it("traduce la fase al español", () => {
    const pomodoro = makePomodoro({
      state: makeState({ phase: "short_break", phase_index: 1, duration_seconds: 300 }),
      secondsRemaining: 300,
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(screen.getByText("Descanso corto")).toBeInTheDocument();
  });

  it("marca el punto del ciclo correspondiente a phase_index", () => {
    const pomodoro = makePomodoro({
      state: makeState({ phase: "short_break", phase_index: 3 }),
      secondsRemaining: 100,
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    const dots = screen.getAllByTestId("cycle-dot");
    expect(dots).toHaveLength(8);
    expect(dots[3]).toHaveAttribute("data-current", "true");
    expect(dots[0]).toHaveAttribute("data-current", "false");
  });

  it("no renderiza los controles si el usuario no es el owner", () => {
    const pomodoro = makePomodoro({
      state: makeState(),
      secondsRemaining: 100,
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(screen.queryByRole("button", { name: /Parar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Iniciar/i })).not.toBeInTheDocument();
  });

  it("el owner arranca el pomodoro desde el botón", async () => {
    const pomodoro = makePomodoro();
    render(<PomodoroPanel pomodoro={pomodoro} isOwner={true} />);

    await userEvent.click(screen.getByRole("button", { name: /Iniciar/i }));

    expect(pomodoro.start).toHaveBeenCalledTimes(1);
  });

  it("el owner lo para desde el botón mientras corre", async () => {
    const pomodoro = makePomodoro({
      state: makeState(),
      secondsRemaining: 100,
      isRunning: true,
    });
    render(<PomodoroPanel pomodoro={pomodoro} isOwner={true} />);

    await userEvent.click(screen.getByRole("button", { name: /Parar/i }));

    expect(pomodoro.stop).toHaveBeenCalledTimes(1);
  });

  it("muestra el error que devuelve el servidor", () => {
    const pomodoro = makePomodoro({
      error: "only the room owner can start the pomodoro",
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(
      screen.getByText("only the room owner can start the pomodoro")
    ).toBeInTheDocument();
  });

  it("muestra el contador personal de pomodoros completados", () => {
    render(
      <PomodoroPanel
        pomodoro={makePomodoro()}
        isOwner={false}
        pomodorosCompleted={7}
      />
    );

    expect(screen.getByTestId("pomodoros-completed")).toHaveTextContent("7");
  });

  it("anuncia la cuenta atrás a lectores de pantalla sin ser intrusiva", () => {
    const pomodoro = makePomodoro({
      state: makeState(),
      secondsRemaining: 100,
      isRunning: true,
    });

    render(<PomodoroPanel pomodoro={pomodoro} isOwner={false} />);

    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "polite");
  });
});
