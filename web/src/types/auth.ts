/** Manual auth types — these mirror the backend responses. */

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
}
