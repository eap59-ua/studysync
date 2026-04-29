import { http } from "./http";
import type { components } from "../types/api";

export type Room = components["schemas"]["RoomResponse"];
export type RoomDetail = components["schemas"]["RoomWithMembersResponse"];
export type CreateRoomInput = components["schemas"]["RoomCreate"];

export const roomsService = {
  listPublic: async (params: { skip?: number; limit?: number } = {}) => {
    // Note: The API returns an array directly: RoomResponse[]
    const { data } = await http.get<Room[]>("/api/v1/rooms/public", { params });
    // Assuming backend will eventually return { items, total }, but for now let's handle the array shape
    // Wait, the Swagger says `RoomResponse[]` directly for the public rooms endpoint.
    return { items: data, total: data.length };
  },
  create: async (input: CreateRoomInput) => {
    const { data } = await http.post<Room>("/api/v1/rooms", input);
    return data;
  },
  getById: async (roomId: string) => {
    const { data } = await http.get<RoomDetail>(`/api/v1/rooms/${roomId}`);
    return data;
  },
  join: async (roomId: string) => {
    // join endpoint returns `unknown` or RoomDetail, we don't care, we just want it to succeed
    const { data } = await http.post(`/api/v1/rooms/${roomId}/join`);
    return data;
  },
  leave: async (roomId: string) => {
    await http.post(`/api/v1/rooms/${roomId}/leave`);
  },
};
