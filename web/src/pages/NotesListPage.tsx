import { useEffect, useState } from "react";
import { notesService } from "../services/notes.service";
import { NoteCard } from "../components/notes/NoteCard";
import { UploadNoteDialog } from "../components/notes/UploadNoteDialog";
import { Button } from "../components/ui/Button";
import { SORT_LABELS, type NotesSort, type PaginatedNotes } from "../types/notes";

const PAGE_SIZE = 12;
const FILTER_DEBOUNCE_MS = 300;

export function NotesListPage() {
  const [subject, setSubject] = useState("");
  const [debouncedSubject, setDebouncedSubject] = useState("");
  const [sort, setSort] = useState<NotesSort>("created_desc");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PaginatedNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setUploadOpen] = useState(false);
  /** Cambia al subir un apunte para forzar la recarga del listado. */
  const [reloadToken, setReloadToken] = useState(0);

  // Sin esto se dispararía una petición por tecla pulsada
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSubject(subject), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [subject]);

  // Quedarse en la página 5 al cambiar de filtro enseñaría un vacío engañoso.
  // Se hace en los manejadores y no en un efecto: no hace falta un render de más.
  const changeSubject = (value: string) => {
    setSubject(value);
    setPage(1);
  };

  const changeSort = (value: NotesSort) => {
    setSort(value);
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;

    notesService
      .list({
        subject: debouncedSubject || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudieron cargar los apuntes. Inténtalo de nuevo.");
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSubject, sort, page, reloadToken]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  // No hace falta un estado `loading`: mientras no haya datos ni error, se está
  // cargando. En las recargas por filtro se mantiene la lista anterior en vez de
  // parpadear a esqueleto, que se percibe peor.
  const isFirstLoad = !data && !error;
  const isEmpty = !error && data?.items.length === 0;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Apuntes</h1>
          <p className="mt-2 text-gray-600">
            Material compartido por la comunidad, ordenado como prefieras.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>Subir apunte</Button>
      </div>

      <UploadNoteDialog
        isOpen={isUploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => setReloadToken((t) => t + 1)}
      />

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label
            htmlFor="subject-filter"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Asignatura
          </label>
          <input
            id="subject-filter"
            type="search"
            value={subject}
            onChange={(e) => changeSubject(e.target.value)}
            placeholder="Filtra por asignatura"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="sm:w-56">
          <label
            htmlFor="sort-select"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Ordenar por
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => changeSort(e.target.value as NotesSort)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(Object.keys(SORT_LABELS) as NotesSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}

      {isFirstLoad && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              data-testid="note-skeleton"
              className="h-44 rounded-xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="text-center py-16">
          {debouncedSubject || subject ? (
            <p className="text-gray-500">
              No hay ningún apunte de <strong>{subject}</strong>. Prueba con otra
              asignatura.
            </p>
          ) : (
            <p className="text-gray-500">
              Todavía no hay apuntes. Sube el primero y estrena la biblioteca.
            </p>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map((item) => (
              <NoteCard key={item.note.id} item={item} />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <span className="text-sm text-gray-500">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
