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
    // Backend expects form-encoded for OAuth2PasswordRequestForm
    const params = new URLSearchParams();
    params.append("username", payload.email);
    params.append("password", payload.password);

    const { data } = await http.post<LoginResponse>("/api/v1/auth/login", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
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

  refresh: async (refreshToken: string): Promise<RefreshResponse> => {
    const { data } = await http.post<RefreshResponse>("/api/v1/auth/refresh", {
      refresh_token: refreshToken,
    });
    return data;
  },
};
