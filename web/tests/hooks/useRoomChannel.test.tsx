import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRoomChannel } from "@/hooks/useRoomChannel";

vi.mock("@/lib/storage", () => ({
  authStorage: {
    getAccessToken: vi.fn().mockReturnValue("fake-token"),
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState = 0;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).WebSocket = MockWebSocket;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MockWebSocket as any).OPEN = 1;

describe("useRoomChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("abre un único WebSocket aunque haya varios suscriptores", () => {
    // La razón de existir de este hook: presencia y pomodoro cuelgan del mismo
    // socket. Si cada uno abriera el suyo volveríamos al bug de miembros
    // duplicados que se cerró en c530db5.
    const { result } = renderHook(() => useRoomChannel("room1"));

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      result.current.subscribe(() => {});
      result.current.subscribe(() => {});
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("/ws/rooms/room1");
  });

  it("entrega cada mensaje a todos los suscriptores", () => {
    const { result } = renderHook(() => useRoomChannel("room1"));

    act(() => {
      vi.runAllTimers();
    });

    const seenByFirst: unknown[] = [];
    const seenBySecond: unknown[] = [];

    act(() => {
      result.current.subscribe((msg) => seenByFirst.push(msg));
      result.current.subscribe((msg) => seenBySecond.push(msg));
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "pomodoro.stopped" }),
      });
    });

    expect(seenByFirst).toEqual([{ type: "pomodoro.stopped" }]);
    expect(seenBySecond).toEqual([{ type: "pomodoro.stopped" }]);
  });

  it("deja de entregar mensajes tras desuscribirse", () => {
    const { result } = renderHook(() => useRoomChannel("room1"));

    act(() => {
      vi.runAllTimers();
    });

    const seen: unknown[] = [];
    let unsubscribe = () => {};

    act(() => {
      unsubscribe = result.current.subscribe((msg) => seen.push(msg));
    });

    act(() => {
      unsubscribe();
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "pomodoro.stopped" }),
      });
    });

    expect(seen).toEqual([]);
  });

  it("expone send para mandar mensajes por el socket", () => {
    const { result } = renderHook(() => useRoomChannel("room1"));

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      result.current.send({ type: "pomodoro.start" });
    });

    expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: "pomodoro.start" })
    );
  });
});
