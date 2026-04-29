import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { roomsService, type RoomDetail } from "../services/rooms.service";
import { MemberList } from "../components/rooms/MemberList";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";

export function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (!id || !user) return;
    let isMounted = true;

    const loadRoom = async () => {
      try {
        const data = await roomsService.getById(id);
        const isMember = data.members?.some((m) => m.id === user.id);
        
        if (!isMember && !joinAttempted.current) {
          joinAttempted.current = true;
          await roomsService.join(id);
          // Reload to get updated members
          const updatedData = await roomsService.getById(id);
          if (isMounted) setRoomDetail(updatedData);
        } else {
          if (isMounted) setRoomDetail(data);
        }
      } catch {
        if (isMounted) setError("Error al cargar la sala.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRoom();

    return () => {
      isMounted = false;
    };
  }, [id, user]);

  const handleLeave = async () => {
    if (!id) return;
    try {
      await roomsService.leave(id);
      navigate("/rooms");
    } catch (err) {
      console.error("Error al salir de la sala", err);
      // Even if it fails (e.g. backend error), we should probably let them leave the UI
      navigate("/rooms");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="sr-only">Cargando...</span>
      </div>
    );
  }

  if (error || !roomDetail) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 p-4 rounded-md text-red-700">
          {error || "Sala no encontrada"}
        </div>
        <Button className="mt-4" onClick={() => navigate("/rooms")}>
          Volver a salas
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{roomDetail.name}</h1>
        <p className="mt-2 text-lg text-gray-600">{roomDetail.subject}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-gray-100 rounded-xl border border-gray-200 min-h-[60vh] flex items-center justify-center">
          {/* Placeholder for VideoGrid */}
          <p className="text-gray-500">VideoGrid se añadirá aquí</p>
        </div>

        <div className="lg:col-span-1">
          <MemberList members={roomDetail.members || []} />
        </div>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-8 flex justify-end">
        <Button variant="secondary" onClick={handleLeave} className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
          Salir del room
        </Button>
      </div>
    </div>
  );
}
