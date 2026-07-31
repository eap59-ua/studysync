import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { authStorage } from "../lib/storage";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Rutas cuyo 401 significa "credenciales incorrectas" o "refresh inválido", no
 * "sesión caducada". Refrescar aquí sería, en el mejor caso, inútil; en el del
 * propio `/auth/refresh`, un bucle.
 */
const NO_REFRESH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/refresh",
];

interface RetriableConfig extends InternalAxiosRequestConfig {
  /** Marca de que esta petición ya se reintentó tras refrescar. */
  _retry?: boolean;
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

http.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Refresco en curso, compartido por todas las peticiones que caduquen a la vez.
 *
 * Sin esta cola, tres llamadas en paralelo con el token caducado lanzarían tres
 * refrescos simultáneos: el primero rota el token y los otros dos se quedan con
 * respuestas que ya no valen. La primera lo pide y las demás esperan a la misma
 * promesa.
 */
let refreshPromise: Promise<string> | null = null;

function endSession() {
  authStorage.clear();
  window.dispatchEvent(new CustomEvent("auth:unauthenticated"));
}

async function requestNewAccessToken(): Promise<string> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) throw new Error("No hay refresh token guardado");

  const { data } = await http.post<{ access_token: string }>("/api/v1/auth/refresh", {
    refresh_token: refreshToken,
  });
  authStorage.setAccessToken(data.access_token);
  return data.access_token;
}

function getFreshAccessToken(): Promise<string> {
  refreshPromise ??= requestNewAccessToken().finally(() => {
    // Se libera pase lo que pase: si un refresco falla, el siguiente 401 tiene
    // que poder intentarlo otra vez en vez de heredar la promesa rechazada.
    refreshPromise = null;
  });
  return refreshPromise;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? "";
    const isAuthPath = NO_REFRESH_PATHS.some((path) => url.startsWith(path));

    const isRecoverable =
      error.response?.status === 401 && config && !config._retry && !isAuthPath;

    if (!isRecoverable) {
      // Un 401 que no se puede recuperar sí cierra la sesión. Los de las rutas
      // de auth los gestiona quien las llama: fallar el login no es caducar.
      if (error.response?.status === 401 && !isAuthPath) endSession();
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      await getFreshAccessToken();
    } catch {
      // Solo el fallo del refresco cierra la sesión aquí.
      endSession();
      return Promise.reject(error);
    }

    // El reintento va sin red: si vuelve a dar 401, entrará otra vez por este
    // interceptor y allí, ya con `_retry` puesto, se cerrará la sesión una sola
    // vez. Envolverlo en el try de arriba la cerraría por duplicado.
    return http(config);
  },
);
