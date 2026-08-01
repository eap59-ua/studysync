import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NoteDetailPage } from "@/pages/NoteDetailPage";
import { notesService } from "@/services/notes.service";
import { AuthContext } from "@/context/AuthContext";
import type { NoteDetail } from "@/types/notes";

vi.mock("@/services/notes.service", () => ({
  notesService: {
    getById: vi.fn(),
    addReview: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const OWNER = { id: "owner-1", display_name: "User One" };
const READER = {
  id: "reader-2",
  email: "r@test.com",
  display_name: "User Two",
  is_active: true,
};

function makeDetail(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return {
    note: {
      id: "note-1",
      owner_id: OWNER.id,
      room_id: null,
      subject: "Cálculo II",
      title: "Integrales por partes",
      description: "Resumen del tema 3",
      file_url: "http://localhost:8000/uploads/a.pdf",
      file_type: "application/pdf",
      file_size_bytes: 204_800,
      original_filename: "a.pdf",
    },
    owner: OWNER,
    rating_avg: 4.5,
    reviews_count: 2,
    reviews: [
      {
        id: "rev-1",
        reviewer_id: "reader-9",
        rating: 5,
        comment: "Impecable",
        reviewer: { id: "reader-9", display_name: "User Three" },
      },
      {
        id: "rev-2",
        reviewer_id: "reader-8",
        rating: 4,
        comment: "Muy útil",
        reviewer: { id: "reader-8", display_name: "User Four" },
      },
    ],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderPage = (user: any = READER) =>
  render(
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
      <MemoryRouter initialEntries={["/notes/note-1"]}>
        <Routes>
          <Route path="/notes/:id" element={<NoteDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe("NoteDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesService.getById).mockResolvedValue(makeDetail());
  });

  it("pinta los metadatos, la media y las reseñas", async () => {
    renderPage();

    expect(await screen.findByText("Integrales por partes")).toBeInTheDocument();
    expect(screen.getByText("Cálculo II")).toBeInTheDocument();
    expect(screen.getByText("Resumen del tema 3")).toBeInTheDocument();
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText("Impecable")).toBeInTheDocument();
    expect(screen.getByText("Muy útil")).toBeInTheDocument();
  });

  it("ofrece la descarga apuntando al fichero", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: /Descargar/i });
    expect(link).toHaveAttribute("href", "http://localhost:8000/uploads/a.pdf");
  });

  it("dice que no hay reseñas cuando el apunte no tiene ninguna", async () => {
    vi.mocked(notesService.getById).mockResolvedValue(
      makeDetail({ reviews: [], reviews_count: 0, rating_avg: 0 })
    );

    renderPage();

    expect(await screen.findByText(/Todavía no tiene reseñas/i)).toBeInTheDocument();
  });

  it("no ofrece el formulario de reseña en un apunte propio", async () => {
    // El backend responde 4xx: enseñar el formulario sería prometer algo falso
    renderPage({ ...READER, id: OWNER.id });

    await screen.findByText("Integrales por partes");
    expect(screen.queryByRole("button", { name: /Enviar reseña/i })).not.toBeInTheDocument();
  });

  it("tampoco lo ofrece si el usuario ya reseñó el apunte", async () => {
    vi.mocked(notesService.getById).mockResolvedValue(
      makeDetail({
        reviews: [
          {
            id: "rev-1",
            reviewer_id: READER.id,
            rating: 5,
            comment: "Ya la dejé",
            reviewer: { id: READER.id, display_name: READER.display_name },
          },
        ],
        reviews_count: 1,
      })
    );

    renderPage();

    await screen.findByText("Ya la dejé");
    expect(screen.queryByRole("button", { name: /Enviar reseña/i })).not.toBeInTheDocument();
  });

  it("envía la reseña y recarga el detalle", async () => {
    vi.mocked(notesService.addReview).mockResolvedValue({
      id: "rev-3",
      reviewer_id: READER.id,
      rating: 4,
      comment: "Muy claro",
      reviewer: { id: READER.id, display_name: READER.display_name },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Integrales por partes");
    const callsBefore = vi.mocked(notesService.getById).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /4 estrellas/i }));
    await user.type(screen.getByLabelText(/Comentario/i), "Muy claro");
    await user.click(screen.getByRole("button", { name: /Enviar reseña/i }));

    await waitFor(() => {
      expect(notesService.addReview).toHaveBeenCalledWith("note-1", {
        rating: 4,
        comment: "Muy claro",
      });
      expect(vi.mocked(notesService.getById).mock.calls.length).toBeGreaterThan(
        callsBefore
      );
    });
  });

  it("exige elegir una puntuación antes de enviar", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Integrales por partes");

    await user.click(screen.getByRole("button", { name: /Enviar reseña/i }));

    expect(await screen.findByText(/Elige una puntuación/i)).toBeInTheDocument();
    expect(notesService.addReview).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor al reseñar", async () => {
    vi.mocked(notesService.addReview).mockRejectedValue({
      response: { data: { detail: "You already reviewed this note" } },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Integrales por partes");

    await user.click(screen.getByRole("button", { name: /3 estrellas/i }));
    await user.click(screen.getByRole("button", { name: /Enviar reseña/i }));

    expect(
      await screen.findByText("You already reviewed this note")
    ).toBeInTheDocument();
  });

  it("solo el dueño puede borrar el apunte", async () => {
    renderPage();
    await screen.findByText("Integrales por partes");
    expect(screen.queryByRole("button", { name: /Eliminar/i })).not.toBeInTheDocument();
  });

  it("borra el apunte y vuelve al listado", async () => {
    vi.mocked(notesService.remove).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage({ ...READER, id: OWNER.id });
    await screen.findByText("Integrales por partes");

    await user.click(screen.getByRole("button", { name: /Eliminar/i }));

    await waitFor(() => {
      expect(notesService.remove).toHaveBeenCalledWith("note-1");
      expect(mockNavigate).toHaveBeenCalledWith("/notes");
    });
  });

  it("avisa si el apunte no se puede cargar", async () => {
    vi.mocked(notesService.getById).mockRejectedValue(new Error("404"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo cargar/i);
  });
});
