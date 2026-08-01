import { useEffect, useState } from "react";
import { RoomCard } from "../components/rooms/RoomCard";
import { CreateRoomDialog } from "../components/rooms/CreateRoomDialog";
import { roomsService, type Room } from "../services/rooms.service";
import { Button } from "../components/ui/Button";

export function RoomsListPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    roomsService
      .listPublic()
      .then((data) => {
        if (isMounted) {
          setRooms(data.items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Error al cargar las salas. Por favor, intenta de nuevo.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    // Skeleton con la forma del contenido en vez de un spinner centrado: la
    // misma espera se percibe más corta cuando ya se intuye lo que va a venir.
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8" role="status">
        <div className="h-9 w-64 rounded bg-gray-100 animate-pulse" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100 animate-pulse" />
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
        <span className="sr-only">Cargando salas...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Salas de Estudio</h1>
          <p className="mt-2 text-sm text-gray-600">
            Únete a una sala pública o crea la tuya propia
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          Crear Sala
        </Button>
      </div>

      {error ? (
        <div className="bg-red-50 p-4 rounded-md text-red-700">{error}</div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay salas disponibles</h3>
          <p className="mt-1 text-sm text-gray-500">Sé el primero en crear una nueva sala de estudio.</p>
          <div className="mt-6">
            <Button onClick={() => setIsDialogOpen(true)} variant="secondary">
              Crear Sala
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}

      <CreateRoomDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </div>
  );
}
