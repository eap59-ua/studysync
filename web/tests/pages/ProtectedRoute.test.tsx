import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function renderWithAuth(status: "loading" | "authenticated" | "unauthenticated") {
  const ctx = {
    status,
    user: status === "authenticated" ? { id: "1", email: "a@b.com", display_name: "Test", is_active: true } : null,
    accessToken: status === "authenticated" ? "tok" : null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={ctx}>
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<p>Secret content</p>} />
          </Route>
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("ProtectedRoute", () => {
  it("redirects to login when unauthenticated", () => {
    renderWithAuth("unauthenticated");
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    renderWithAuth("authenticated");
    expect(screen.getByText("Secret content")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("shows loading when status is loading", () => {
    renderWithAuth("loading");
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });
});
