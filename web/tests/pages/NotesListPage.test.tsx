import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { NotesListPage } from "@/pages/NotesListPage";
import { notesService } from "@/services/notes.service";
import type { NoteWithStats, PaginatedNotes } from "@/types/notes";

vi.mock("@/services/notes.service", () => ({
  notesService: {
    list: vi.fn(),
    upload: vi.fn(),
  },
}));

function makeItem(overrides: Partial<NoteWithStats["note"]> = {}): NoteWithStats {
  return {
    note: {
      id: "note-1",
      owner_id: "user-9",
      room_id: null,
      subject: "Cálculo II",
      title: "Integrales por partes",
      description: "Resumen del tema 3",
      file_url: "http://localhost:8000/uploads/a.pdf",
      file_type: "application/pdf",
      file_size_bytes: 204_800,
      original_filename: "a.pdf",
      ...overrides,
    },
    owner: { id: "user-9", display_name: "User Two" },
    rating_avg: 4.5,
    reviews_count: 2,
  };
}

function page(items: NoteWithStats[], total = items.length): PaginatedNotes {
  return { items, page: 1, limit: 12, total };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <NotesListPage />
    </MemoryRouter>
  );

describe("NotesListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesService.list).mockResolvedValue(page([makeItem()]));
  });

  it("renderiza los apuntes que devuelve el servicio", async () => {
    renderPage();

    expect(await screen.findByText("Integrales por partes")).toBeInTheDocument();
    expect(screen.getByText("Cálculo II")).toBeInTheDocument();
    expect(screen.getByText("User Two")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay ningún apunte", async () => {
    vi.mocked(notesService.list).mockResolvedValue(page([]));

    renderPage();

    expect(await screen.findByText(/Todavía no hay apuntes/i)).toBeInTheDocument();
  });

  it("distingue el vacío por filtro del vacío a secas", async () => {
    vi.mocked(notesService.list).mockResolvedValue(page([]));

    renderPage();
    await screen.findByText(/Todavía no hay apuntes/i);

    await userEvent.type(screen.getByLabelText(/Asignatura/i), "Química");

    // Copy distinto: aquí sí hay apuntes, pero ninguno de esa asignatura
    expect(await screen.findByText(/ningún apunte de/i)).toBeInTheDocument();
  });

  it("filtra por asignatura llamando al servicio con el parámetro", async () => {
    renderPage();
    await screen.findByText("Integrales por partes");

    await userEvent.type(screen.getByLabelText(/Asignatura/i), "Física");

    await waitFor(() => {
      expect(notesService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ subject: "Física", page: 1 })
      );
    });
  });

  it("vuelve a pedir con el orden nuevo al cambiar el selector", async () => {
    renderPage();
    await screen.findByText("Integrales por partes");

    await userEvent.selectOptions(screen.getByLabelText(/Ordenar/i), "rating_desc");

    await waitFor(() => {
      expect(notesService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "rating_desc" })
      );
    });
  });

  it("pide la página siguiente al paginar", async () => {
    vi.mocked(notesService.list).mockResolvedValue(page([makeItem()], 30));

    renderPage();
    await screen.findByText("Integrales por partes");

    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    await waitFor(() => {
      expect(notesService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it("no deja pasar de la última página", async () => {
    vi.mocked(notesService.list).mockResolvedValue(page([makeItem()], 1));

    renderPage();
    await screen.findByText("Integrales por partes");

    expect(screen.getByRole("button", { name: /Siguiente/i })).toBeDisabled();
  });

  it("vuelve a la página 1 al cambiar el filtro", async () => {
    vi.mocked(notesService.list).mockResolvedValue(page([makeItem()], 30));

    renderPage();
    await screen.findByText("Integrales por partes");
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    await waitFor(() =>
      expect(notesService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      )
    );

    // Seguir en la página 2 con otro filtro enseñaría un vacío engañoso
    await userEvent.type(screen.getByLabelText(/Asignatura/i), "Física");

    await waitFor(() => {
      expect(notesService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ subject: "Física", page: 1 })
      );
    });
  });

  it("abre el diálogo de subida desde el listado", async () => {
    renderPage();
    await screen.findByText("Integrales por partes");

    await userEvent.click(screen.getByRole("button", { name: /Subir apunte/i }));

    expect(screen.getByLabelText(/Fichero/i)).toBeInTheDocument();
  });

  it("recarga el listado tras subir un apunte", async () => {
    vi.mocked(notesService.upload).mockResolvedValue({
      id: "note-2",
      owner_id: "u1",
      room_id: null,
      subject: "Física",
      title: "Tema 1",
      description: "",
      file_url: "http://localhost:8000/uploads/b.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      original_filename: "b.pdf",
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Integrales por partes");
    const callsBefore = vi.mocked(notesService.list).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /Subir apunte/i }));
    await user.type(screen.getByLabelText(/Asignatura del apunte/i), "Física");
    await user.type(screen.getByLabelText(/Título/i), "Tema 1");
    await user.upload(
      screen.getByLabelText(/Fichero/i),
      new File(["x"], "b.pdf", { type: "application/pdf" })
    );
    await user.click(screen.getByRole("button", { name: /^Subir$/i }));

    // Sin recarga, el apunte recién subido no aparecería hasta refrescar a mano
    await waitFor(() => {
      expect(vi.mocked(notesService.list).mock.calls.length).toBeGreaterThan(
        callsBefore
      );
    });
  });

  it("avisa si el listado falla en vez de quedarse en blanco", async () => {
    vi.mocked(notesService.list).mockRejectedValue(new Error("network"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudieron cargar/i);
  });
});
