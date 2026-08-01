import { describe, it, expect, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { notesService } from "@/services/notes.service";
import { http } from "@/services/http";

/**
 * Se ejerce la instancia real de axios con un adaptador falso: así se comprueba
 * lo que de verdad sale por el cable, incluidas las cabeceras que el propio
 * axios reescribe.
 */
describe("notesService", () => {
  let lastConfig: InternalAxiosRequestConfig;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("studysync.accessToken", "token");

    http.defaults.adapter = async (config) => {
      lastConfig = config;
      return {
        data: {},
        status: 200,
        statusText: "200",
        headers: {},
        config,
      };
    };
  });

  it("lista con los parámetros de filtro, orden y paginación", async () => {
    await notesService.list({
      subject: "Cálculo II",
      sort: "rating_desc",
      page: 2,
      limit: 20,
    });

    expect(lastConfig.url).toBe("/api/v1/notes");
    expect(lastConfig.params).toEqual({
      subject: "Cálculo II",
      sort: "rating_desc",
      page: 2,
      limit: 20,
    });
  });

  it("no manda parámetros vacíos al filtrar por asignatura", async () => {
    await notesService.list({ sort: "created_desc", page: 1, limit: 12 });

    expect(lastConfig.params).not.toHaveProperty("subject");
    expect(lastConfig.params).not.toHaveProperty("room_id");
  });

  it("pide el detalle de un apunte por id", async () => {
    await notesService.getById("note-1");

    expect(lastConfig.method).toBe("get");
    expect(lastConfig.url).toBe("/api/v1/notes/note-1");
  });

  it("sube el apunte como FormData con todos los campos", async () => {
    const file = new File(["contenido"], "apuntes.pdf", { type: "application/pdf" });

    await notesService.upload({
      subject: "Cálculo II",
      title: "Tema 3",
      description: "Integrales",
      file,
    });

    expect(lastConfig.method).toBe("post");
    expect(lastConfig.url).toBe("/api/v1/notes");

    const body = lastConfig.data as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("subject")).toBe("Cálculo II");
    expect(body.get("title")).toBe("Tema 3");
    expect(body.get("description")).toBe("Integrales");
    expect(body.get("file")).toBe(file);
  });

  it("no fuerza el Content-Type en la subida", async () => {
    // La instancia de axios fija application/json. Si eso llega en un multipart,
    // el navegador no pone el boundary y el backend responde 422.
    const file = new File(["contenido"], "apuntes.pdf", { type: "application/pdf" });

    await notesService.upload({ subject: "Cálculo II", title: "Tema 3", file });

    const contentType =
      lastConfig.headers?.["Content-Type"] ?? lastConfig.headers?.["content-type"];
    expect(contentType).not.toBe("application/json");
  });

  it("omite los campos opcionales que no se rellenan", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });

    await notesService.upload({ subject: "Física", title: "Tema 1", file });

    const body = lastConfig.data as FormData;
    expect(body.has("description")).toBe(false);
    expect(body.has("room_id")).toBe(false);
  });

  it("manda room_id cuando el apunte cuelga de una sala", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });

    await notesService.upload({
      subject: "Física",
      title: "Tema 1",
      room_id: "room-9",
      file,
    });

    expect((lastConfig.data as FormData).get("room_id")).toBe("room-9");
  });

  it("borra un apunte por id", async () => {
    await notesService.remove("note-1");

    expect(lastConfig.method).toBe("delete");
    expect(lastConfig.url).toBe("/api/v1/notes/note-1");
  });

  it("envía la reseña con puntuación y comentario", async () => {
    await notesService.addReview("note-1", { rating: 4, comment: "Muy claro" });

    expect(lastConfig.method).toBe("post");
    expect(lastConfig.url).toBe("/api/v1/notes/note-1/reviews");
    expect(JSON.parse(lastConfig.data as string)).toEqual({
      rating: 4,
      comment: "Muy claro",
    });
  });
});
