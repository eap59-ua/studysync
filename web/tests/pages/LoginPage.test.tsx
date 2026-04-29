import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "@/context/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import type { AuthState } from "@/types/auth";

function renderLoginPage(overrides: Partial<AuthState & { login: (...args: unknown[]) => Promise<void>; register: (...args: unknown[]) => Promise<void>; logout: () => void }> = {}) {
  const defaultCtx = {
    status: "unauthenticated" as const,
    user: null,
    accessToken: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };

  return render(
    <AuthContext.Provider value={defaultCtx}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation error for empty password", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    // Don't type password - leave it empty
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText("Contraseña requerida")).toBeInTheDocument();
    });
  });

  it("calls login on valid submit", async () => {
    const loginFn = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLoginPage({ login: loginFn });

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(loginFn).toHaveBeenCalledWith("test@example.com", "password123");
    });
  });
});
