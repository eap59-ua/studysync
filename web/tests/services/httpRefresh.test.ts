import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

/**
 * Estos tests montan un adaptador falso sobre la instancia real de axios: se
 * ejerce el interceptor de verdad, con su pipeline completo, y solo se sustituye
 * el transporte.
 */

interface FakeReply {
  status: number;
  data?: unknown;
}

type Handler = (config: InternalAxiosRequestConfig) => FakeReply;

const ACCESS_KEY = "studysync.accessToken";
const REFRESH_KEY = "studysync.refreshToken";
const USER_KEY = "studysync.user";

describe("http — refresco automático del access token", () => {
  let http: AxiosInstance;
  let calls: { url: string; auth?: string }[];
  let handler: Handler;
  let unauthorizedEvents: number;

  const onUnauthorized = () => {
    unauthorizedEvents += 1;
  };

  const callsTo = (url: string) => calls.filter((c) => c.url === url).length;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(ACCESS_KEY, "access-caducado");
    localStorage.setItem(REFRESH_KEY, "refresh-bueno");
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: "u1", email: "u1@test.com", display_name: "User One" })
    );

    calls = [];
    unauthorizedEvents = 0;
    window.addEventListener("auth:unauthenticated", onUnauthorized);

    // Módulo limpio en cada test: `refreshPromise` vive a nivel de módulo.
    vi.resetModules();
    http = (await import("@/services/http")).http;

    http.defaults.adapter = async (config) => {
      calls.push({
        url: config.url ?? "",
        auth: config.headers?.Authorization as string | undefined,
      });

      const reply = handler(config);
      const response = {
        data: reply.data ?? {},
        status: reply.status,
        statusText: String(reply.status),
        headers: {},
        config,
      };

      if (reply.status >= 200 && reply.status < 300) return response;

      // Los adaptadores de axios son responsables de rechazar en no-2xx.
      throw new AxiosError(
        `Request failed with status code ${reply.status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response
      );
    };
  });

  afterEach(() => {
    window.removeEventListener("auth:unauthenticated", onUnauthorized);
  });

  it("ante un 401 refresca el token y reintenta la petición original", async () => {
    handler = (config) => {
      if (config.url === "/api/v1/auth/refresh") {
        return { status: 200, data: { access_token: "access-nuevo" } };
      }
      // El primer intento va con el token caducado; el reintento, con el nuevo
      return calls.filter((c) => c.url === "/api/v1/rooms/public").length === 1
        ? { status: 401 }
        : { status: 200, data: { ok: true } };
    };

    const { data } = await http.get("/api/v1/rooms/public");

    expect(data).toEqual({ ok: true });
    expect(callsTo("/api/v1/auth/refresh")).toBe(1);
    expect(callsTo("/api/v1/rooms/public")).toBe(2);
    expect(localStorage.getItem(ACCESS_KEY)).toBe("access-nuevo");
  });

  it("reintenta con el token nuevo, no con el caducado", async () => {
    handler = (config) => {
      if (config.url === "/api/v1/auth/refresh") {
        return { status: 200, data: { access_token: "access-nuevo" } };
      }
      return calls.filter((c) => c.url === "/api/v1/rooms/public").length === 1
        ? { status: 401 }
        : { status: 200, data: { ok: true } };
    };

    await http.get("/api/v1/rooms/public");

    const roomCalls = calls.filter((c) => c.url === "/api/v1/rooms/public");
    expect(roomCalls[0].auth).toBe("Bearer access-caducado");
    expect(roomCalls[1].auth).toBe("Bearer access-nuevo");
  });

  it("con tres peticiones caducadas en paralelo dispara un solo refresh", async () => {
    const seen: Record<string, number> = {};

    handler = (config) => {
      const url = config.url ?? "";
      if (url === "/api/v1/auth/refresh") {
        return { status: 200, data: { access_token: "access-nuevo" } };
      }
      seen[url] = (seen[url] ?? 0) + 1;
      // Cada endpoint falla su primera vez y va bien en el reintento
      return seen[url] === 1 ? { status: 401 } : { status: 200, data: { url } };
    };

    const results = await Promise.all([
      http.get("/api/v1/rooms/public"),
      http.get("/api/v1/users/me/stats"),
      http.get("/api/v1/auth/me"),
    ]);

    // Sin cola serían tres refresh simultáneos y dos de ellos sobrarían
    expect(callsTo("/api/v1/auth/refresh")).toBe(1);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(localStorage.getItem(ACCESS_KEY)).toBe("access-nuevo");
  });

  it("si el refresh falla, limpia la sesión y avisa", async () => {
    handler = (config) =>
      config.url === "/api/v1/auth/refresh" ? { status: 401 } : { status: 401 };

    await expect(http.get("/api/v1/rooms/public")).rejects.toThrow();

    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(unauthorizedEvents).toBe(1);
  });

  it("un 401 del propio /auth/refresh no entra en bucle", async () => {
    handler = () => ({ status: 401 });

    await expect(
      http.post("/api/v1/auth/refresh", { refresh_token: "refresh-bueno" })
    ).rejects.toThrow();

    // Se llamó una vez porque lo pidió el consumidor, no una segunda por el
    // interceptor intentando refrescar el refresh.
    expect(callsTo("/api/v1/auth/refresh")).toBe(1);
  });

  it("un 401 del login no intenta refrescar nada", async () => {
    handler = () => ({ status: 401 });

    await expect(
      http.post("/api/v1/auth/login", { email: "u1@test.com", password: "mala" })
    ).rejects.toThrow();

    // Credenciales incorrectas no son una sesión caducada
    expect(callsTo("/api/v1/auth/refresh")).toBe(0);
    expect(localStorage.getItem(ACCESS_KEY)).toBe("access-caducado");
    expect(unauthorizedEvents).toBe(0);
  });

  it("no reintenta la misma petición más de una vez", async () => {
    handler = (config) =>
      config.url === "/api/v1/auth/refresh"
        ? { status: 200, data: { access_token: "access-nuevo" } }
        : { status: 401 };

    await expect(http.get("/api/v1/rooms/public")).rejects.toThrow();

    // Un 401 tras refrescar significa que no era cuestión del token
    expect(callsTo("/api/v1/rooms/public")).toBe(2);
    expect(callsTo("/api/v1/auth/refresh")).toBe(1);
    expect(unauthorizedEvents).toBe(1);
  });

  it("sin refresh token guardado cierra la sesión sin llamar al endpoint", async () => {
    localStorage.removeItem(REFRESH_KEY);
    handler = () => ({ status: 401 });

    await expect(http.get("/api/v1/rooms/public")).rejects.toThrow();

    expect(callsTo("/api/v1/auth/refresh")).toBe(0);
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(unauthorizedEvents).toBe(1);
  });

  it("tras un refresh fallido, una petición posterior vuelve a intentarlo", async () => {
    // La cola no puede quedarse pegada a una promesa ya resuelta
    handler = () => ({ status: 401 });
    await expect(http.get("/api/v1/rooms/public")).rejects.toThrow();
    expect(callsTo("/api/v1/auth/refresh")).toBe(1);

    localStorage.setItem(REFRESH_KEY, "refresh-bueno");
    handler = (config) =>
      config.url === "/api/v1/auth/refresh"
        ? { status: 200, data: { access_token: "access-nuevo" } }
        : calls.filter((c) => c.url === "/api/v1/notes").length === 1
          ? { status: 401 }
          : { status: 200, data: { ok: true } };

    await http.get("/api/v1/notes");

    expect(callsTo("/api/v1/auth/refresh")).toBe(2);
  });
});
