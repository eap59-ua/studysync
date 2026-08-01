import { useState } from "react";
import { StarRating } from "../ui/StarRating";
import { Button } from "../ui/Button";
import { notesService } from "../../services/notes.service";

interface ReviewFormProps {
  noteId: string;
  /** Se llama tras guardar para que el detalle se recargue. */
  onSubmitted: () => void;
}

export function ReviewForm({ noteId, onSubmitted }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (rating === 0) {
      setError("Elige una puntuación de 1 a 5 estrellas.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      await notesService.addReview(noteId, {
        rating,
        comment: comment.trim() || undefined,
      });
      setRating(0);
      setComment("");
      onSubmitted();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // El backend distingue "ya la valoraste" de "es tuya"; ese matiz se pierde
      // si se sustituye por un mensaje propio.
      setError(
        typeof detail === "string" ? detail : "No se pudo guardar la reseña.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-100 p-5 space-y-4"
    >
      <h3 className="text-sm font-medium text-gray-900">Deja tu reseña</h3>

      <div>
        <span className="block text-sm text-gray-700 mb-1">Puntuación</span>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div>
        <label
          htmlFor="review-comment"
          className="block text-sm text-gray-700 mb-1"
        >
          Comentario (opcional)
        </label>
        <textarea
          id="review-comment"
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" isLoading={isSending}>
        Enviar reseña
      </Button>
    </form>
  );
}
