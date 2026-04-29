import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-4 text-lg text-gray-600">Página no encontrada</p>
      <Link
        to="/"
        className="mt-6 text-indigo-600 hover:text-indigo-500 font-medium"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
