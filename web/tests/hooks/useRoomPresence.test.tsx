import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRoomPresence } from "@/hooks/useRoomPresence";

// Mock partysocket module
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockClose = vi.fn();
const mockSend = vi.fn();

vi.mock("partysocket", () => {
  return {
    default: class MockPartySocket {
      constructor() {
        return {
          addEventListener: mockAddEventListener,
          removeEventListener: mockRemoveEventListener,
          close: mockClose,
          send: mockSend,
        };
      }
    },
  };
});

// Mock authStorage to always return a token
vi.mock("@/lib/storage", () => ({
  authStorage: {
    getAccessToken: vi.fn().mockReturnValue("fake-token"),
  },
}));

describe("useRoomPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty members and connecting status", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));
    expect(result.current.members).toEqual([]);
    expect(result.current.status).toBe("connecting");
  });

  it("handles user_joined message", () => {
    const { result } = renderHook(() => useRoomPresence("room1"));

    // Find the message handler
    const messageHandlerCall = mockAddEventListener.mock.calls.find(
      (call) => call[0] === "message"
    );
    expect(messageHandlerCall).toBeDefined();

    const onMessage = messageHandlerCall[1];

    act(() => {
      onMessage({
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

    const onMessage = mockAddEventListener.mock.calls.find((call) => call[0] === "message")[1];

    act(() => {
      onMessage({
        data: JSON.stringify({
          type: "user_joined",
          user: { id: "u1", display_name: "User 1" },
          count: 1,
        }),
      });
    });

    expect(result.current.members).toHaveLength(1);

    act(() => {
      onMessage({
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

  it("ignores invalid JSON without crashing", () => {
    renderHook(() => useRoomPresence("room1"));

    const onMessage = mockAddEventListener.mock.calls.find((call) => call[0] === "message")[1];

    expect(() => {
      act(() => {
        onMessage({ data: "invalid-json" });
      });
    }).not.toThrow();
  });
});
