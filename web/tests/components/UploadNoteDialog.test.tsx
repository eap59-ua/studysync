import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadNoteDialog } from "@/components/notes/UploadNoteDialog";
import { notesService } from "@/services/notes.service";

vi.mock("@/services/notes.service", () => ({
  notesService: { upload: vi.fn() },
}));

/** Fichero con el tamaño falseado: reservar 11 MB de verdad no aporta nada. */
function fileOfSize(bytes: number, name: string, type: string): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

const onClose = vi.fn();
const onUploaded = vi.fn();

const renderDialog = () =>
  render(<UploadNoteDialog isOpen onClose={onClose} onUploaded={onUploaded} />);

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Asignatura/i), "Cálculo II");
  await user.type(screen.getByLabelText(/Título/i), "Tema 3");
}

describe("UploadNoteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesService.upload).mockResolvedValue({
      id: "note-1",
      owner_id: "u1",
      room_id: null,
      subject: "Cálculo II",
      title: "Tema 3",
      description: "",
      file_url: "http://localhost:8000/uploads/a.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      original_filename: "a.pdf",
    });
  });

  it("rechaza en cliente un fichero de más de 10 MB", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);

    await user.upload(
      screen.getByLabelText(/Fichero/i),
      fileOfSize(11 * 1024 * 1024, "grande.pdf", "application/pdf")
    );
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    expect(
      await screen.findByText("El fichero supera el máximo de 10 MB")
    ).toBeInTheDocument();
    // Ni se intenta: subir 11 MB para que los rechacen es tiempo del usuario
    expect(notesService.upload).not.toHaveBeenCalled();
  });

  it("rechaza en cliente un tipo de fichero no admitido", async () => {
    // `applyAccept: false` salta el filtro del atributo accept a propósito: es
    // una comodidad del navegador, no una garantía — en el diálogo del sistema
    // se puede elegir "todos los archivos". Lo que se prueba es la validación.
    const user = userEvent.setup({ applyAccept: false });
    renderDialog();
    await fillRequiredFields(user);

    await user.upload(
      screen.getByLabelText(/Fichero/i),
      fileOfSize(1024, "virus.exe", "application/x-msdownload")
    );
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    expect(await screen.findByText(/Formato no admitido/i)).toBeInTheDocument();
    expect(notesService.upload).not.toHaveBeenCalled();
  });

  it("exige asignatura y título", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(
      screen.getByLabelText(/Fichero/i),
      fileOfSize(1024, "a.pdf", "application/pdf")
    );
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    expect(await screen.findByText(/asignatura es obligatoria/i)).toBeInTheDocument();
    expect(notesService.upload).not.toHaveBeenCalled();
  });

  it("sube el apunte y avisa al padre para que recargue", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);

    const file = fileOfSize(2048, "apuntes.pdf", "application/pdf");
    await user.upload(screen.getByLabelText(/Fichero/i), file);
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    await waitFor(() => {
      expect(notesService.upload).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Cálculo II", title: "Tema 3", file })
      );
      expect(onUploaded).toHaveBeenCalledTimes(1);
    });
  });

  it("muestra tal cual el error que devuelve el servidor", async () => {
    // El backend comprueba los magic bytes: un .exe renombrado a .pdf pasa la
    // validación de cliente y lo tumba él. Ese mensaje hay que enseñarlo.
    vi.mocked(notesService.upload).mockRejectedValue({
      response: { data: { detail: "Invalid PDF file signature." } },
    });

    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.upload(
      screen.getByLabelText(/Fichero/i),
      fileOfSize(2048, "falso.pdf", "application/pdf")
    );
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    expect(await screen.findByText("Invalid PDF file signature.")).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("deshabilita el botón mientras la subida está en curso", async () => {
    let resolveUpload: (v: unknown) => void = () => {};
    vi.mocked(notesService.upload).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }) as ReturnType<typeof notesService.upload>
    );

    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.upload(
      screen.getByLabelText(/Fichero/i),
      fileOfSize(2048, "apuntes.pdf", "application/pdf")
    );
    await user.click(screen.getByRole("button", { name: /Subir/i }));

    // Sin esto, un doble clic sube el apunte dos veces
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Subir/i })).toBeDisabled();
    });

    resolveUpload({});
  });

  it("no renderiza nada si está cerrado", () => {
    render(
      <UploadNoteDialog isOpen={false} onClose={onClose} onUploaded={onUploaded} />
    );

    expect(screen.queryByLabelText(/Fichero/i)).not.toBeInTheDocument();
  });
});
