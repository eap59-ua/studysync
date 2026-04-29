import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoomDetailPage } from "@/pages/RoomDetailPage";
import { roomsService } from "@/services/rooms.service";
import { AuthContext } from "@/context/AuthContext";

vi.mock("@/services/rooms.service", () => ({
  roomsService: {
    getById: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("RoomDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderWithAuth = (user: any) => {
    return render(
      <AuthContext.Provider
        value={{
          status: "authenticated",
          user,
          accessToken: "token",
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={["/rooms/room1"]}>
          <Routes>
            <Route path="/rooms/:id" element={<RoomDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  };

  it("loads room and joins if not a member", async () => {
    vi.mocked(roomsService.getById)
      .mockResolvedValueOnce({
        id: "room1",
        name: "Test Room",
        subject: "Math",
        max_members: 10,
        is_public: true,
        owner_id: "user1",
        members: [], // User is not a member initially
      })
      .mockResolvedValueOnce({
        id: "room1",
        name: "Test Room",
        subject: "Math",
        max_members: 10,
        is_public: true,
        owner_id: "user1",
        members: [{ id: "user2", email: "user2@test.com", display_name: "User 2", is_active: true }],
      });
      
    vi.mocked(roomsService.join).mockResolvedValue({});

    renderWithAuth({ id: "user2", email: "user2@test.com", display_name: "User 2", is_active: true });

    await waitFor(() => {
      expect(roomsService.getById).toHaveBeenCalledTimes(2); // Initial + after join
      expect(roomsService.join).toHaveBeenCalledWith("room1");
      expect(screen.getByText("Test Room")).toBeInTheDocument();
      expect(screen.getByText("Math")).toBeInTheDocument();
    });
  });

  it("calls leave and navigates on exit", async () => {
    vi.mocked(roomsService.getById).mockResolvedValue({
      id: "room1",
      name: "Test Room",
      subject: "Math",
      max_members: 10,
      is_public: true,
      owner_id: "user1",
      members: [{ id: "user2", email: "user2@test.com", display_name: "User 2", is_active: true }],
    });
    vi.mocked(roomsService.leave).mockResolvedValue({});

    renderWithAuth({ id: "user2", email: "user2@test.com", display_name: "User 2", is_active: true });

    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /Salir del room/i });
    await user.click(btn);

    await waitFor(() => {
      expect(roomsService.leave).toHaveBeenCalledWith("room1");
      expect(mockNavigate).toHaveBeenCalledWith("/rooms");
    });
  });
});
