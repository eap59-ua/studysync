import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { roomsService, type RoomDetail } from "../services/rooms.service";
import { MemberList } from "../components/rooms/MemberList";
import { PomodoroPanel } from "../components/rooms/PomodoroPanel";
import { RoomVideoGrid } from "../components/rooms/RoomVideoGrid";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useRoomPresence } from "../hooks/useRoomPresence";
import { useRoomPomodoro } from "../hooks/useRoomPomodoro";
import { useUserPomodoroStats } from "../hooks/useUserPomodoroStats";

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

  // Un solo socket para todo el room; de él cuelgan presencia y pomodoro.
  const channel = useRoomChannel(id || "");
  const { status: wsStatus } = channel;
  const { members: activeMembers } = useRoomPresence(channel);
  const pomodoro = useRoomPomodoro(channel);
  const { pomodorosCompleted } = useUserPomodoroStats(channel);

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
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8" role="status">
        <div className="h-9 w-72 max-w-full rounded bg-gray-100 animate-pulse" />
        <div className="mt-3 h-5 w-40 rounded bg-gray-100 animate-pulse" />
        {/* Misma retícula que la sala ya cargada, para que no dé un salto */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:order-2 lg:col-span-1 h-80 rounded-xl bg-gray-100 animate-pulse" />
          <div className="lg:order-1 lg:col-span-2 h-80 rounded-xl bg-gray-100 animate-pulse" />
          <div className="lg:order-3 lg:col-span-1 h-48 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        <span className="sr-only">Cargando sala...</span>
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
        {/* En móvil el Pomodoro va primero: es lo que se mira cada pocos
            minutos. En escritorio se recoloca entre el vídeo y los miembros. */}
        <div className="lg:order-2 lg:col-span-1">
          <PomodoroPanel
            pomodoro={pomodoro}
            isOwner={user?.id === roomDetail.owner_id}
            pomodorosCompleted={pomodorosCompleted}
          />
        </div>

        <div className="lg:order-1 lg:col-span-2 bg-black rounded-xl border border-gray-800 min-h-[60vh] flex items-center justify-center overflow-hidden">
          <RoomVideoGrid roomId={id || ""} />
        </div>

        <div className="lg:order-3 lg:col-span-1">
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
