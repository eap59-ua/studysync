interface StarRatingProps {
  /** Puntuación actual. Admite decimales en modo lectura (la media). */
  value: number;
  /** Si se pasa, el componente entra en modo edición. */
  onChange?: (value: number) => void;
  size?: "sm" | "md";
}

const SIZES = { sm: "h-4 w-4", md: "h-6 w-6" };

function Star({ filled, className }: { filled: number; className: string }) {
  // `filled` va de 0 a 1 para poder pintar medias estrellas en la media
  return (
    <span className={`relative inline-block ${className}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" className={`${className} absolute text-gray-200`} fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.951-.69l1.285-3.958z" />
      </svg>
      <span
        className="absolute overflow-hidden"
        style={{ width: `${filled * 100}%` }}
      >
        <svg viewBox="0 0 20 20" className={`${className} text-amber-400`} fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.951-.69l1.285-3.958z" />
        </svg>
      </span>
    </span>
  );
}

export function StarRating({ value, onChange, size = "sm" }: StarRatingProps) {
  const starSize = SIZES[size];
  const stars = [1, 2, 3, 4, 5];

  if (!onChange) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        aria-label={`${value} de 5 estrellas`}
      >
        {stars.map((n) => (
          <Star key={n} filled={Math.min(1, Math.max(0, value - n + 1))} className={starSize} />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
          aria-pressed={value === n}
          className="rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
        >
          <Star filled={n <= value ? 1 : 0} className={SIZES[size === "sm" ? "md" : "md"]} />
        </button>
      ))}
    </span>
  );
}
