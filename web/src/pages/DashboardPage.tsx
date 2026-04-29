import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          ¡Hola, {user?.display_name}!
        </h1>
        <p className="text-gray-500 mb-8">
          Bienvenido a tu panel principal de StudySync.
        </p>
        
        <div className="space-y-4">
          <Button 
            className="w-full" 
            onClick={() => navigate("/rooms")}
          >
            Ver salas de estudio
          </Button>
          
          <Button 
            variant="secondary" 
            className="w-full" 
            onClick={() => logout()}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
