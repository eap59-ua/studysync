import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">¡Hola, {user?.display_name}!</h1>
      <p className="text-gray-600 mb-8">Pronto verás tus rooms aquí.</p>
      <Button onClick={logout}>Cerrar sesión</Button>
    </div>
  );
}
