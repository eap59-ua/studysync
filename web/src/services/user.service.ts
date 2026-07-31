import { http } from "./http";

export interface UserStats {
  pomodoros_completed: number;
}

export const userService = {
  /**
   * Contador personal de pomodoros completados. Lo lleva el backend en Redis y
   * lo incrementa al cerrarse cada fase de foco, para los usuarios que estén
   * conectados al room en ese momento.
   */
  getStats: async (): Promise<UserStats> => {
    const { data } = await http.get<UserStats>("/api/v1/users/me/stats");
    return data;
  },
};
