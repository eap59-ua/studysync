import { http } from "./http";
import type { components } from "../types/api";

export type LiveKitTokenResponse = components["schemas"]["LiveKitTokenResponse"];

export const livekitService = {
  getJoinToken: async (roomId: string): Promise<LiveKitTokenResponse> => {
    const { data } = await http.post<LiveKitTokenResponse>(`/api/v1/rooms/${roomId}/livekit-token`);
    return data;
  },
};
