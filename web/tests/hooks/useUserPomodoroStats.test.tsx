import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUserPomodoroStats } from "@/hooks/useUserPomodoroStats";
import { userService } from "@/services/user.service";
import { http } from "@/services/http";
import { createFakeRoomChannel, type FakeRoomChannel } from "../helpers/fakeRoomChannel";

vi.mock("@/services/http", () => ({
  http: { get: vi.fn() },
}));

function phaseChange(fromPhase: string, toPhase: string) {
  return {
    type: "pomodoro.phase_change",
    from_phase: fromPhase,
    to_phase: toPhase,
    state: {
      phase: toPhase,
      started_at: "2026-07-31T12:00:00.000Z",
      duration_seconds: 300,
      phase_index: 1,
      started_by: "owner-id",
    },
  };
}

describe("userService.getStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide el contador al endpoint de stats", async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { pomodoros_completed: 7 } });

    const stats = await userService.getStats();

    expect(http.get).toHaveBeenCalledWith("/api/v1/users/me/stats");
    expect(stats.pomodoros_completed).toBe(7);
  });
});

describe("useUserPomodoroStats", () => {
  let channel: FakeRoomChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = createFakeRoomChannel();
    vi.mocked(http.get).mockResolvedValue({ data: { pomodoros_completed: 3 } });
  });

  it("carga el contador al montarse", async () => {
    const { result } = renderHook(() => useUserPomodoroStats(channel));

    await waitFor(() => {
      expect(result.current.pomodorosCompleted).toBe(3);
    });
  });

  it("lo recarga al terminar una fase de foco", async () => {
    const { result } = renderHook(() => useUserPomodoroStats(channel));

    await waitFor(() => expect(result.current.pomodorosCompleted).toBe(3));

    // El backend incrementa el contador justo al cerrarse una fase de foco
    vi.mocked(http.get).mockResolvedValue({ data: { pomodoros_completed: 4 } });

    act(() => {
      channel.emit(phaseChange("focus", "short_break"));
    });

    await waitFor(() => {
      expect(result.current.pomodorosCompleted).toBe(4);
    });
  });

  it("no lo recarga cuando la fase que termina es un descanso", async () => {
    renderHook(() => useUserPomodoroStats(channel));

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));

    act(() => {
      channel.emit(phaseChange("short_break", "focus"));
    });

    // Un descanso no suma pomodoros: pedirlo otra vez sería tráfico inútil
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it("se queda a 0 si el endpoint falla, sin romper la sala", async () => {
    vi.mocked(http.get).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useUserPomodoroStats(channel));

    await waitFor(() => {
      expect(result.current.pomodorosCompleted).toBe(0);
    });
  });
});
