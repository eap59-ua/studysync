import axios, { type AxiosInstance } from "axios";
import { authStorage } from "../lib/storage";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear();
      window.dispatchEvent(new CustomEvent("auth:unauthenticated"));
    }
    return Promise.reject(error);
  },
);
