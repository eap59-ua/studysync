import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CreateRoomDialog } from "@/components/rooms/CreateRoomDialog";
import { roomsService } from "@/services/rooms.service";

vi.mock("@/services/rooms.service", () => ({
  roomsService: {
    create: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("CreateRoomDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <MemoryRouter>
        <CreateRoomDialog isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByText("Crear Nueva Sala")).not.toBeInTheDocument();
  });

  it("calls create and navigates on success", async () => {
    vi.mocked(roomsService.create).mockResolvedValue({
      id: "room123",
      name: "My Room",
      subject: "Math",
      max_members: 5,
      is_public: true,
      owner_id: "user1",
    });

    const handleClose = vi.fn();
    render(
      <MemoryRouter>
        <CreateRoomDialog isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nombre de la sala/i), "My Room");
    await user.type(screen.getByLabelText(/Asignatura/i), "Math");
    await user.click(screen.getByRole("button", { name: /Crear Sala/i }));

    await waitFor(() => {
      expect(roomsService.create).toHaveBeenCalledWith({
        name: "My Room",
        subject: "Math",
        max_members: 8, // default
        is_public: true, // default
      });
      expect(handleClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/rooms/room123");
    });
  });
});
