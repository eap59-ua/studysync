import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { roomsService, type RoomDetail } from "../services/rooms.service";
import { MemberList } from "../components/rooms/MemberList";
import { RoomVideoGrid } from "../components/rooms/RoomVideoGrid";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { useRoomPresence } from "../hooks/useRoomPresence";

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

  const { status: wsStatus, members: activeMembers } = useRoomPresence(id || "");

  const handleLeave = async () => {
    if (!id) return;
    try {
      await roomsService.leave(id);
      navigate("/rooms");
    } catch {
      console.error("Error al salir de la sala");
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

  // Combinar los miembros base con la presencia WS, asumiendo que el WS tiene la fuente de verdad actualizada si activeMembers > 0
  const displayMembers = activeMembers.length > 0 ? activeMembers : (roomDetail.members || []);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{roomDetail.name}</h1>
          <p className="mt-2 text-lg text-gray-600">{roomDetail.subject}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-500">Estado:</span>
          {wsStatus === "open" && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Conectado</span>}
          {wsStatus === "reconnecting" && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Reconectando...</span>}
          {wsStatus === "connecting" && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Conectando...</span>}
          {wsStatus === "closed" && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Desconectado</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-black rounded-xl border border-gray-800 min-h-[60vh] flex items-center justify-center overflow-hidden">
          <RoomVideoGrid roomId={id || ""} />
        </div>

        <div className="lg:col-span-1">
          <MemberList members={displayMembers} />
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
