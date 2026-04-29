import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { registerSchema, type RegisterInput } from "../services/auth.schemas";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function RegisterPage() {
  const { register: authRegister } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError("");
    try {
      await authRegister(data.email, data.password, data.display_name);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        setServerError(axiosErr.response?.data?.detail || "Error al registrar");
      } else {
        setServerError("Error de conexión con el servidor");
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">StudySync</h1>
          <p className="mt-2 text-sm text-gray-600">Crea tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Nombre"
            autoComplete="name"
            error={errors.display_name?.message}
            {...register("display_name")}
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {serverError && (
            <p className="text-sm text-red-500" role="alert">
              {serverError}
            </p>
          )}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Crear cuenta
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
