/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthState, User } from "../types/auth";
import { authStorage } from "../lib/storage";
import { authService } from "../services/auth.service";

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, accessToken: null });

  // On mount: validate stored token
  useEffect(() => {
    const validateSession = async () => {
      const storedToken = authStorage.getAccessToken();
      const storedUser = authStorage.getUser();

      if (!storedToken || !storedUser) {
        setState({ status: "unauthenticated", user: null, accessToken: null });
        return;
      }

      try {
        const me = await authService.me();
        const user: User = {
          id: me.id,
          email: me.email,
          display_name: me.display_name,
          is_active: me.is_active,
        };
        setState({ status: "authenticated", user, accessToken: storedToken });
      } catch {
        authStorage.clear();
        setState({ status: "unauthenticated", user: null, accessToken: null });
      }
    };

    validateSession();
  }, []);

  // Listen for 401 events from the HTTP interceptor
  useEffect(() => {
    const handler = () => {
      setState({ status: "unauthenticated", user: null, accessToken: null });
    };
    window.addEventListener("auth:unauthenticated", handler);
    return () => window.removeEventListener("auth:unauthenticated", handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login({ email, password });

    // After login, fetch user info
    const me = await authService.me();
    const user: User = {
      id: me.id,
      email: me.email,
      display_name: me.display_name,
      is_active: me.is_active,
    };

    authStorage.set({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
      },
    });

    setState({
      status: "authenticated",
      user,
      accessToken: response.access_token,
    });
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      await authService.register({
        email,
        password,
        display_name: displayName,
      });
      // Auto-login after registration
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    authStorage.clear();
    setState({ status: "unauthenticated", user: null, accessToken: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
