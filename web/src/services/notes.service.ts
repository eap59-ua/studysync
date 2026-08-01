import { http } from "./http";
import type {
  Note,
  NoteDetail,
  NoteReview,
  NotesSort,
  PaginatedNotes,
} from "../types/notes";

export interface ListNotesParams {
  subject?: string;
  room_id?: string;
  sort: NotesSort;
  page: number;
  limit: number;
}

export interface UploadNoteInput {
  subject: string;
  title: string;
  description?: string;
  room_id?: string;
  file: File;
}

export interface AddReviewInput {
  rating: number;
  comment?: string;
}

export const notesService = {
  list: async (params: ListNotesParams): Promise<PaginatedNotes> => {
    // Los opcionales vacíos se omiten: `?subject=` filtraría por cadena vacía
    const query: Record<string, string | number> = {
      sort: params.sort,
      page: params.page,
      limit: params.limit,
    };
    if (params.subject) query.subject = params.subject;
    if (params.room_id) query.room_id = params.room_id;

    const { data } = await http.get<PaginatedNotes>("/api/v1/notes", {
      params: query,
    });
    return data;
  },

  getById: async (noteId: string): Promise<NoteDetail> => {
    const { data } = await http.get<NoteDetail>(`/api/v1/notes/${noteId}`);
    return data;
  },

  upload: async (input: UploadNoteInput): Promise<Note> => {
    const body = new FormData();
    body.append("subject", input.subject);
    body.append("title", input.title);
    if (input.description) body.append("description", input.description);
    if (input.room_id) body.append("room_id", input.room_id);
    body.append("file", input.file);

    const { data } = await http.post<Note>("/api/v1/notes", body, {
      // La instancia fija application/json. Hay que anularlo para que el
      // navegador ponga multipart/form-data con su boundary; forzarlo a mano
      // sin boundary hace que el backend responda 422.
      headers: { "Content-Type": undefined },
    });
    return data;
  },

  remove: async (noteId: string): Promise<void> => {
    await http.delete(`/api/v1/notes/${noteId}`);
  },

  addReview: async (noteId: string, input: AddReviewInput): Promise<NoteReview> => {
    const { data } = await http.post<NoteReview>(
      `/api/v1/notes/${noteId}/reviews`,
      input,
    );
    return data;
  },
};
