import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRoomPomodoro } from "@/hooks/useRoomPomodoro";
import { createFakeRoomChannel, type FakeRoomChannel } from "../helpers/fakeRoomChannel";

const FOCUS_SECONDS = 1500;
const SHORT_BREAK_SECONDS = 300;

/** Momento fijo desde el que se calculan todos los tiempos del fichero. */
const NOW = new Date("2026-07-31T12:00:00.000Z").getTime();

function stateMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: "pomodoro.state",
    state: {
      phase: "focus",
      started_at: new Date(NOW).toISOString(),
      duration_seconds: FOCUS_SECONDS,
      phase_index: 0,
      started_by: "owner-id",
      ...overrides,
    },
  };
}

describe("useRoomPomodoro", () => {
  let channel: FakeRoomChannel;

  beforeEach(() => {
    channel = createFakeRoomChannel();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("arranca vacío cuando no hay pomodoro activo", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    expect(result.current.state).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("calcula la cuenta atrás desde started_at, no desde que llega el mensaje", () => {
    // Al entrar a una sala con el pomodoro ya empezado, el `pomodoro.state`
    // inicial trae una fase vieja. Si se recalibrase el reloj con él, la cuenta
    // atrás arrancaría en la duración completa y cada cliente vería un número
    // distinto — justo lo que esta feature promete evitar.
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(
        stateMessage({ started_at: new Date(NOW - 600_000).toISOString() })
      );
    });

    expect(result.current.secondsRemaining).toBe(FOCUS_SECONDS - 600);
    expect(result.current.isRunning).toBe(true);
    expect(result.current.state?.phase).toBe("focus");
  });

  it("decrementa la cuenta atrás cada segundo", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(stateMessage());
    });
    expect(result.current.secondsRemaining).toBe(FOCUS_SECONDS);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.secondsRemaining).toBe(FOCUS_SECONDS - 3);
  });

  it("se queda en 0 al agotarse y no cambia de fase por su cuenta", () => {
    // El servidor es la autoridad: el cliente muestra 00:00 y espera el
    // pomodoro.phase_change. Un segundo de 00:00 es correcto.
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(stateMessage());
    });

    act(() => {
      vi.advanceTimersByTime((FOCUS_SECONDS + 5) * 1000);
    });

    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.state?.phase).toBe("focus");
    expect(result.current.state?.phase_index).toBe(0);
  });

  it("aplica pomodoro.phase_change cambiando fase y duración", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(stateMessage());
    });

    act(() => {
      channel.emit({
        type: "pomodoro.phase_change",
        from_phase: "focus",
        to_phase: "short_break",
        state: {
          phase: "short_break",
          started_at: new Date(NOW).toISOString(),
          duration_seconds: SHORT_BREAK_SECONDS,
          phase_index: 1,
          started_by: "owner-id",
        },
      });
    });

    expect(result.current.state?.phase).toBe("short_break");
    expect(result.current.state?.phase_index).toBe(1);
    expect(result.current.secondsRemaining).toBe(SHORT_BREAK_SECONDS);
  });

  it("vuelve al estado vacío con pomodoro.stopped", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(stateMessage());
    });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      channel.emit({ type: "pomodoro.stopped" });
    });

    expect(result.current.state).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("expone el mensaje de error que manda el servidor", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit({
        type: "error",
        message: "only the room owner can start the pomodoro",
      });
    });

    expect(result.current.error).toBe("only the room owner can start the pomodoro");
  });

  it("start y stop mandan el mensaje del contrato por el canal", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      result.current.start();
    });
    expect(channel.send).toHaveBeenCalledWith({ type: "pomodoro.start" });

    act(() => {
      result.current.stop();
    });
    expect(channel.send).toHaveBeenCalledWith({ type: "pomodoro.stop" });
  });

  it("usa el reloj del servidor cuando el del cliente va desfasado", () => {
    // El navegador va 30 s atrasado. Un phase_change sí es un mensaje recién
    // emitido, así que sirve para calibrar: la fase entrante tiene que
    // arrancar en su duración completa, no en duración + desfase.
    vi.setSystemTime(NOW - 30_000);

    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit({
        type: "pomodoro.phase_change",
        from_phase: "focus",
        to_phase: "short_break",
        state: {
          phase: "short_break",
          started_at: new Date(NOW).toISOString(),
          duration_seconds: SHORT_BREAK_SECONDS,
          phase_index: 1,
          started_by: "owner-id",
        },
      });
    });

    expect(result.current.secondsRemaining).toBe(SHORT_BREAK_SECONDS);
  });

  it("ignora los mensajes de presencia que viajan por el mismo canal", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit(stateMessage());
      channel.emit({
        type: "user_joined",
        user: { id: "u1", display_name: "User 1" },
        count: 1,
      });
    });

    expect(result.current.state?.phase).toBe("focus");
    expect(result.current.isRunning).toBe(true);
  });

  it("limpia el error al arrancar un pomodoro correctamente", () => {
    const { result } = renderHook(() => useRoomPomodoro(channel));

    act(() => {
      channel.emit({ type: "error", message: "algo falló" });
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      channel.emit(stateMessage());
    });

    expect(result.current.error).toBeNull();
  });
});
