import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginSchema, type LoginInput } from "../services/auth.schemas";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function LoginPage() {
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState("");
  const [isEnteringAsGuest, setEnteringAsGuest] = useState(false);

  // Se muestra salvo que se apague explícitamente: olvidarse de la variable no
  // debe dejar la demo pública sin su puerta de entrada, que es su razón de ser.
  const showGuestAccess = import.meta.env.VITE_DEMO_MODE !== "false";

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError("");
    try {
      await login(data.email, data.password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        setServerError(axiosErr.response?.data?.detail || "Error de autenticación");
      } else {
        setServerError("Error de conexión con el servidor");
      }
    }
  };

  const handleGuestAccess = async () => {
    setServerError("");
    setEnteringAsGuest(true);
    try {
      await loginAsGuest();
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      // El 404 es el caso esperado cuando el backend no tiene el modo demo
      // activado; conviene decirlo distinto de un fallo de red.
      const status =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      setServerError(
        status === 404
          ? "La demo no está disponible en este servidor."
          : "No se pudo entrar como invitado. Inténtalo de nuevo.",
      );
    } finally {
      setEnteringAsGuest(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">StudySync</h1>
          <p className="mt-2 text-sm text-gray-600">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {serverError && (
            <p className="text-sm text-red-500" role="alert">
              {serverError}
            </p>
          )}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Iniciar sesión
          </Button>
        </form>

        {showGuestAccess && (
          <div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs uppercase tracking-wide text-gray-400">
                  o
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="mt-4 w-full"
              isLoading={isEnteringAsGuest}
              onClick={handleGuestAccess}
            >
              Entrar como invitado
            </Button>
            <p className="mt-2 text-center text-xs text-gray-500">
              Sin registro. Entras en una sala con gente y apuntes de ejemplo.
            </p>
          </div>
        )}

        <p className="text-center text-sm text-gray-600">
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
