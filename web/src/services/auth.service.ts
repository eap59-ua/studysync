import { http } from "./http";
import type {
  LoginResponse,
  MeResponse,
  RegisterResponse,
  RefreshResponse,
} from "../types/auth";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  display_name: string;
}

export const authService = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const { data } = await http.post<LoginResponse>("/api/v1/auth/login", payload);
    return data;
  },

  register: async (payload: RegisterPayload): Promise<RegisterResponse> => {
    const { data } = await http.post<RegisterResponse>("/api/v1/auth/register", payload);
    return data;
  },

  me: async (): Promise<MeResponse> => {
    const { data } = await http.get<MeResponse>("/api/v1/auth/me");
    return data;
  },

  /**
   * Entra con una cuenta de demostración sin pedir credenciales. El backend
   * reparte entre varias cuentas para que dos visitantes simultáneos sean
   * personas distintas en la sala. Devuelve 404 si el modo demo está apagado.
   */
  demoLogin: async (): Promise<LoginResponse> => {
    const { data } = await http.post<LoginResponse>("/api/v1/auth/demo");
    return data;
  },

  refresh: async (refreshToken: string): Promise<RefreshResponse> => {
    const { data } = await http.post<RefreshResponse>("/api/v1/auth/refresh", {
      refresh_token: refreshToken,
    });
    return data;
  },
};
