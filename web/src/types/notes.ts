import type { components } from "./api";

export type Note = components["schemas"]["NoteResponse"];
export type NoteWithStats = components["schemas"]["NoteWithStatsResponse"];
export type NoteDetail = components["schemas"]["NoteDetailResponse"];
export type NoteReview = components["schemas"]["NoteReviewResponse"];
export type PaginatedNotes = components["schemas"]["PaginatedNotesResponse"];

export type NotesSort = "rating_desc" | "created_desc" | "created_asc";

export const SORT_LABELS: Record<NotesSort, string> = {
  rating_desc: "Mejor valorados",
  created_desc: "Más recientes",
  created_asc: "Más antiguos",
};

/**
 * Límites que replican los del servidor (`NotesService`). Validar en cliente
 * evita subir 10 MB para que los rechacen, pero el servidor sigue siendo el que
 * manda: además comprueba los magic bytes, así que un .exe renombrado a .pdf
 * pasa esta validación y lo tumba él.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
] as const;

export const ALLOWED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp,.md,.txt";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
