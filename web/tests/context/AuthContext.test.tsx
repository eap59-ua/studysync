import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, AuthContext } from "@/context/AuthContext";
import { useContext } from "react";

// Mock the auth service
vi.mock("@/services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
    refresh: vi.fn(),
  },
}));

// Mock localStorage
const mockStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  length: 0,
  key: () => null,
});

import { authService } from "@/services/auth.service";
const mockedAuth = vi.mocked(authService);

function TestConsumer() {
  const ctx = useContext(AuthContext);
  if (!ctx) return <p>no context</p>;
  return (
    <div>
      <p data-testid="status">{ctx.status}</p>
      <p data-testid="user">{ctx.user?.display_name ?? "none"}</p>
      <button onClick={ctx.logout}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  it("starts in loading state then becomes unauthenticated when no stored token", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Initially shows loading (or quickly resolves to unauthenticated)
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    });
  });

  it("validates stored token and becomes authenticated", async () => {
    mockStorage["studysync.accessToken"] = "fake-token";
    mockStorage["studysync.user"] = JSON.stringify({ id: "1", email: "a@b.com", display_name: "Test" });

    mockedAuth.me.mockResolvedValue({
      id: "1",
      email: "a@b.com",
      display_name: "Test",
      is_active: true,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
      expect(screen.getByTestId("user").textContent).toBe("Test");
    });
  });

  it("logout clears storage and state", async () => {
    mockStorage["studysync.accessToken"] = "fake-token";
    mockStorage["studysync.user"] = JSON.stringify({ id: "1", email: "a@b.com", display_name: "Test" });

    mockedAuth.me.mockResolvedValue({
      id: "1",
      email: "a@b.com",
      display_name: "Test",
      is_active: true,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });

    await act(async () => {
      screen.getByText("logout").click();
    });

    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(mockStorage["studysync.accessToken"]).toBeUndefined();
  });
});
