/**
 * Typed wrapper over localStorage for auth persistence.
 *
 * NOTE: localStorage is vulnerable to XSS. Acceptable for MVP since we don't
 * handle financial data. For production, migrate to HttpOnly + Secure +
 * SameSite=Strict cookies (see BACKLOG).
 */

export interface StoredUser {
  id: string;
  email: string;
  display_name: string;
}

const ACCESS_TOKEN_KEY = "studysync.accessToken";
const REFRESH_TOKEN_KEY = "studysync.refreshToken";
const USER_KEY = "studysync.user";

export const authStorage = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),

  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),

  getUser: (): StoredUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },

  set: (params: {
    accessToken: string;
    refreshToken: string;
    user: StoredUser;
  }) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(params.user));
  },

  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
