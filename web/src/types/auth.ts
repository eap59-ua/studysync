import type { components } from "./api";

export type User = components["schemas"]["app__presentation__api__v1__auth_routes__UserResponse"];
export type LoginResponse = components["schemas"]["TokenResponse"];
export type RegisterResponse = components["schemas"]["app__presentation__api__v1__auth_routes__UserResponse"];
export type MeResponse = components["schemas"]["app__presentation__api__v1__auth_routes__UserResponse"];
export type RefreshResponse = components["schemas"]["AccessTokenResponse"];

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
}
