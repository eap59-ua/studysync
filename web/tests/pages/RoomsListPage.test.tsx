import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RoomsListPage } from "@/pages/RoomsListPage";
import { roomsService } from "@/services/rooms.service";

vi.mock("@/services/rooms.service", () => ({
  roomsService: {
    listPublic: vi.fn(),
  },
}));

describe("RoomsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading initially", () => {
    vi.mocked(roomsService.listPublic).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <RoomsListPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("status", { hidden: true })).toBeInTheDocument(); // Tailwind spinner doesn't have role status by default, let's test by class or generic fallback
  });

  it("renders empty state when no rooms", async () => {
    vi.mocked(roomsService.listPublic).mockResolvedValue({ items: [], total: 0 });
    render(
      <MemoryRouter>
        <RoomsListPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("No hay salas disponibles")).toBeInTheDocument();
    });
  });

  it("renders room cards when loaded", async () => {
    vi.mocked(roomsService.listPublic).mockResolvedValue({
      items: [
        {
          id: "1",
          name: "Test Room",
          subject: "Math",
          max_members: 10,
          is_public: true,
          owner_id: "user1",
        },
      ],
      total: 1,
    });
    render(
      <MemoryRouter>
        <RoomsListPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText("Test Room")).toBeInTheDocument();
      expect(screen.getByText("Math")).toBeInTheDocument();
    });
  });
});
