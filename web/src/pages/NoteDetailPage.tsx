import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { notesService } from "../services/notes.service";
import { ReviewForm } from "../components/notes/ReviewForm";
import { StarRating } from "../components/ui/StarRating";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { formatFileSize, type NoteDetail } from "../types/notes";

export function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    notesService
      .getById(id)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el apunte.");
      });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await notesService.remove(id);
      navigate("/notes");
    } catch {
      setError("No se pudo eliminar el apunte.");
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div role="alert" className="p-4 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
        </div>
        <Link to="/notes" className="mt-4 inline-block text-indigo-600 hover:underline">
          Volver a apuntes
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4" role="status">
        <div className="h-8 w-2/3 rounded bg-gray-100 animate-pulse" />
        <div className="mt-4 h-32 rounded-xl bg-gray-100 animate-pulse" />
        <span className="sr-only">Cargando apunte...</span>
      </div>
    );
  }

  const { note, owner, rating_avg, reviews_count, reviews } = detail;
  const isOwner = user?.id === owner.id;
  // El backend rechaza reseñar dos veces; ofrecer el formulario sería prometer
  // algo que va a fallar.
  const alreadyReviewed = reviews.some((r) => r.reviewer_id === user?.id);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <Link to="/notes" className="text-sm text-indigo-600 hover:underline">
        ← Volver a apuntes
      </Link>

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2.5 py-0.5">
          {note.subject}
        </span>

        <h1 className="mt-3 text-3xl font-bold text-gray-900">{note.title}</h1>

        {note.description && (
          <p className="mt-3 text-gray-600">{note.description}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
          <span>Subido por {owner.display_name}</span>
          <span className="flex items-center gap-1.5">
            <StarRating value={rating_avg} />
            <span>
              {reviews_count === 0
                ? "sin valoraciones"
                : `${rating_avg.toFixed(1)} · ${reviews_count} reseñas`}
            </span>
          </span>
        </div>

        <p className="mt-2 text-xs text-gray-400">
          {note.original_filename} · {formatFileSize(note.file_size_bytes)}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={note.file_url}
            download={note.original_filename}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Descargar apunte
          </a>

          {isOwner && (
            <Button
              variant="secondary"
              onClick={handleDelete}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Eliminar
            </Button>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Reseñas ({reviews_count})
        </h2>

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-500 py-6">
            Todavía no tiene reseñas. Si te ha servido, sé el primero en valorarlo.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {review.reviewer.display_name}
                  </span>
                  <StarRating value={review.rating} />
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-gray-600">{review.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {!isOwner && !alreadyReviewed && id && (
          <div className="mt-6">
            <ReviewForm noteId={id} onSubmitted={reload} />
          </div>
        )}
      </section>
    </div>
  );
}
