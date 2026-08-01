import { Link } from "react-router-dom";
import { StarRating } from "../ui/StarRating";
import { formatFileSize, type NoteWithStats } from "../../types/notes";

export function NoteCard({ item }: { item: NoteWithStats }) {
  const { note, owner, rating_avg, reviews_count } = item;

  return (
    <Link
      to={`/notes/${note.id}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <span className="inline-block text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2.5 py-0.5">
        {note.subject}
      </span>

      <h3 className="mt-3 text-base font-semibold text-gray-900 line-clamp-2">
        {note.title}
      </h3>

      {note.description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{note.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-gray-600 truncate">{owner.display_name}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <StarRating value={rating_avg} />
          <span className="text-xs text-gray-500">
            {reviews_count === 0
              ? "sin reseñas"
              : `${rating_avg.toFixed(1)} (${reviews_count})`}
          </span>
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        {note.original_filename} · {formatFileSize(note.file_size_bytes)}
      </p>
    </Link>
  );
}
