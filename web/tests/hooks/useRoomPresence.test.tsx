import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { createFakeRoomChannel, type FakeRoomChannel } from "../helpers/fakeRoomChannel";

describe("useRoomPresence", () => {
  let channel: FakeRoomChannel;

  beforeEach(() => {
    channel = createFakeRoomChannel();
  });

  it("initializes with empty members", () => {
    const { result } = renderHook(() => useRoomPresence(channel));
    expect(result.current.members).toEqual([]);
    expect(result.current.memberCount).toBe(0);
  });

  it("handles user_joined message", () => {
    const { result } = renderHook(() => useRoomPresence(channel));

    act(() => {
      channel.emit({
        type: "user_joined",
        user: { id: "u1", display_name: "User 1" },
        count: 1,
      });
    });

    expect(result.current.members).toEqual([{ id: "u1", display_name: "User 1" }]);
    expect(result.current.memberCount).toBe(1);
  });

  it("handles user_left message", () => {
    const { result } = renderHook(() => useRoomPresence(channel));

    act(() => {
      channel.emit({
        type: "user_joined",
        user: { id: "u1", display_name: "User 1" },
        count: 1,
      });
    });
    expect(result.current.members).toHaveLength(1);

    act(() => {
      channel.emit({ type: "user_left", user: { id: "u1" }, count: 0 });
    });

    expect(result.current.members).toHaveLength(0);
    expect(result.current.memberCount).toBe(0);
  });

  it("deduplica miembros repetidos en presence_state", () => {
    const { result } = renderHook(() => useRoomPresence(channel));

    // Un usuario con dos sockets abiertos llegaba repetido en la lista
    act(() => {
      channel.emit({
        type: "presence_state",
        members: [
          { id: "u1", display_name: "User One" },
          { id: "u2", display_name: "User Two" },
          { id: "u1", display_name: "User One" },
        ],
        count: 2,
      });
    });

    expect(result.current.members).toHaveLength(2);
    expect(result.current.members.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(result.current.memberCount).toBe(2);
  });

  it("no duplica al recibir user_joined de alguien ya presente", () => {
    const { result } = renderHook(() => useRoomPresence(channel));

    act(() => {
      channel.emit({
        type: "presence_state",
        members: [{ id: "u1", display_name: "User One" }],
        count: 1,
      });
      channel.emit({
        type: "user_joined",
        user: { id: "u1", display_name: "User One" },
        count: 1,
      });
    });

    expect(result.current.members).toHaveLength(1);
  });

  it("ignora los mensajes de pomodoro que viajan por el mismo canal", () => {
    // Comparte socket con useRoomPomodoro: no debe reaccionar a lo ajeno.
    const { result } = renderHook(() => useRoomPresence(channel));

    act(() => {
      channel.emit({
        type: "presence_state",
        members: [{ id: "u1", display_name: "User One" }],
        count: 1,
      });
      channel.emit({ type: "pomodoro.stopped" });
    });

    expect(result.current.members).toHaveLength(1);
    expect(result.current.memberCount).toBe(1);
  });

  it("se da de baja del canal al desmontarse", () => {
    const { result, unmount } = renderHook(() => useRoomPresence(channel));

    unmount();

    act(() => {
      channel.emit({
        type: "user_joined",
        user: { id: "u1", display_name: "User 1" },
        count: 1,
      });
    });

    expect(result.current.members).toEqual([]);
  });
});
