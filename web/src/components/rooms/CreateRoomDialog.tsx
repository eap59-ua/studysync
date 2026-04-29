import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { roomsService, type CreateRoomInput } from "../../services/rooms.service";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

const createRoomSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  subject: z.string().min(1, "La asignatura es obligatoria").max(100),
  max_members: z.coerce.number().int().min(2).max(20),
  is_public: z.boolean(),
});

type FormValues = z.infer<typeof createRoomSchema>;

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateRoomDialog({ isOpen, onClose }: CreateRoomDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createRoomSchema) as any,
    defaultValues: {
      name: "",
      subject: "",
      max_members: 8,
      is_public: true,
    },
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FormValues) => {
    try {
      setError(null);
      const room = await roomsService.create(data as CreateRoomInput);
      reset();
      onClose();
      navigate(`/rooms/${room.id}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError(detail.map((d: any) => d.msg).join(", "));
      } else {
        setError("Error al crear la sala");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Crear Nueva Sala</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <span className="sr-only">Cerrar</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Nombre de la sala"
              {...register("name")}
              error={errors.name?.message}
              placeholder="Ej: Grupo de estudio TFG"
            />
            <Input
              label="Asignatura"
              {...register("subject")}
              error={errors.subject?.message}
              placeholder="Ej: Cálculo II"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Máx. miembros (2-20)"
                type="number"
                {...register("max_members")}
                error={errors.max_members?.message}
              />
              
              <div className="flex flex-col justify-end pb-3">
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_public")}
                    className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                  <span>Sala pública</span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex space-x-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1"
                isLoading={isSubmitting}
              >
                Crear Sala
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
