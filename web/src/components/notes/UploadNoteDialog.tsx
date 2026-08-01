import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { notesService } from "../../services/notes.service";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
} from "../../types/notes";

/**
 * Las validaciones replican las del servidor para no hacer subir 10 MB a alguien
 * que van a rechazar. El servidor sigue mandando: además comprueba los magic
 * bytes, así que un .exe renombrado a .pdf pasa por aquí y lo tumba él.
 */
const uploadSchema = z.object({
  subject: z.string().min(1, "La asignatura es obligatoria").max(100),
  title: z.string().min(1, "El título es obligatorio").max(200),
  description: z.string().max(2000).optional(),
  file: z
    .custom<FileList>()
    .refine((files) => files?.length === 1, "Selecciona un fichero")
    .refine(
      (files) => !files?.[0] || files[0].size <= MAX_FILE_BYTES,
      "El fichero supera el máximo de 10 MB",
    )
    .refine(
      (files) =>
        !files?.[0] ||
        (ALLOWED_MIME_TYPES as readonly string[]).includes(files[0].type),
      "Formato no admitido. Se aceptan PDF, imágenes, markdown y texto plano.",
    ),
});

type FormValues = z.infer<typeof uploadSchema>;

interface UploadNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
  /** Si el apunte cuelga de una sala concreta. */
  roomId?: string;
}

export function UploadNoteDialog({
  isOpen,
  onClose,
  onUploaded,
  roomId,
}: UploadNoteDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(uploadSchema) as any,
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FormValues) => {
    try {
      setServerError(null);
      await notesService.upload({
        subject: data.subject,
        title: data.title,
        description: data.description || undefined,
        room_id: roomId,
        file: data.file[0],
      });
      reset();
      onUploaded();
      onClose();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === "string") {
        // Mensaje del servidor tal cual: "Invalid PDF file signature" dice
        // bastante más que un "error al subir" genérico.
        setServerError(detail);
      } else if (Array.isArray(detail)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setServerError(detail.map((d: any) => d.msg).join(", "));
      } else {
        setServerError("No se pudo subir el apunte. Inténtalo de nuevo.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Subir apunte</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <span className="sr-only">Cerrar</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {serverError && (
            <div role="alert" className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label="Asignatura del apunte"
              {...register("subject")}
              error={errors.subject?.message}
              placeholder="Ej: Cálculo II"
            />
            <Input
              label="Título"
              {...register("title")}
              error={errors.title?.message}
              placeholder="Ej: Resumen del tema 3"
            />

            <div>
              <label
                htmlFor="note-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Descripción (opcional)
              </label>
              <textarea
                id="note-description"
                rows={3}
                {...register("description")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="note-file"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Fichero
              </label>
              <input
                id="note-file"
                type="file"
                accept={ALLOWED_EXTENSIONS}
                {...register("file")}
                className="w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                PDF, JPG, PNG, WEBP, MD o TXT. Máximo 10 MB.
              </p>
              {errors.file && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.file.message as string}
                </p>
              )}
            </div>

            <div className="pt-4 flex space-x-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" isLoading={isSubmitting}>
                Subir
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
