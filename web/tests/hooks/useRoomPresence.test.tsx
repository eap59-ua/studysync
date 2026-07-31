import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRoomPresence } from "@/hooks/useRoomPresence";

// Mock authStorage to always return a token
vi.mock("@/lib/storage", () => ({
  authStorage: {
    getAccessToken: vi.fn().mockReturnValue("fake-token"),
  },
}));

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState = 0; // CONNECTING
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 0);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).WebSocket = MockWebSocket;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MockWebSocket as any).OPEN = 1;

describe("useRoomPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with empty members", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));
    expect(result.current.members).toEqual([]);
    expect(result.current.status).toBe("connecting");
  });

  it("handles user_joined message", async () => {
    const { result } = renderHook(() => useRoomPresence("room1"));

    // Let the WS connect
    act(() => { vi.runAllTimers(); });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "user_joined",
          user: { id: "u1", display_name: "User 1" },
          count: 1,
        }),
      });
    });

    expect(result.current.members).toEqual([{ id: "u1", display_name: "User 1" }]);
    expect(result.current.memberCount).toBe(1);
  });

  it("handles user_left message", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));

    act(() => { vi.runAllTimers(); });
    const ws = MockWebSocket.instances[0];

    // Join first
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "user_joined",
          user: { id: "u1", display_name: "User 1" },
          count: 1,
        }),
      });
    });
    expect(result.current.members).toHaveLength(1);

    // Then leave
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "user_left",
          user: { id: "u1" },
          count: 0,
        }),
      });
    });

    expect(result.current.members).toHaveLength(0);
    expect(result.current.memberCount).toBe(0);
  });

  it("deduplica miembros repetidos en presence_state", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));

    act(() => { vi.runAllTimers(); });
    const ws = MockWebSocket.instances[0];

    // Un usuario con dos sockets abiertos llegaba repetido en la lista
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "presence_state",
          members: [
            { id: "u1", display_name: "User One" },
            { id: "u2", display_name: "User Two" },
            { id: "u1", display_name: "User One" },
          ],
          count: 2,
        }),
      });
    });

    expect(result.current.members).toHaveLength(2);
    expect(result.current.members.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(result.current.memberCount).toBe(2);
  });

  it("no duplica al recibir user_joined de alguien ya presente", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));

    act(() => { vi.runAllTimers(); });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "presence_state",
          members: [{ id: "u1", display_name: "User One" }],
          count: 1,
        }),
      });
      ws.onmessage?.({
        data: JSON.stringify({
          type: "user_joined",
          user: { id: "u1", display_name: "User One" },
          count: 1,
        }),
      });
    });

    expect(result.current.members).toHaveLength(1);
  });

  it("ignores invalid JSON without crashing", () => {
    renderHook(() => useRoomPresence("room1"));

    act(() => { vi.runAllTimers(); });
    const ws = MockWebSocket.instances[0];

    expect(() => {
      act(() => {
        ws.onmessage?.({ data: "invalid-json" });
      });
    }).not.toThrow();
  });
});
