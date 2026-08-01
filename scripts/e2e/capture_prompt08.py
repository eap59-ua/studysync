"""Captura la evidencia del Prompt 8: Pomodoro sincronizado y UI de apuntes.

Deja las imágenes en docs/evidence/prompt-08/. Requiere la stack levantada
(docker compose up -d postgres redis livekit + uvicorn + npm run dev) y los
usuarios sembrados con seed_two_users.py.
"""

import asyncio
import json
import os
import sys

os.environ["PYTHONIOENCODING"] = "utf-8"
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx
from playwright.async_api import async_playwright

API = "http://127.0.0.1:8000/api/v1"
WEB = "http://localhost:5173"
PASSWORD = "TestPass123!"


async def login(client: httpx.AsyncClient, email: str) -> dict:
    r = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    r.raise_for_status()
    data = r.json()
    me = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"}
        )
    ).json()
    return {"tokens": data, "user": me}


async def prepare_data() -> dict:
    """Deja un room y un apunte con reseña listos para las capturas."""
    async with httpx.AsyncClient(base_url=API, timeout=15) as client:
        one = await login(client, "user1@test.com")
        two = await login(client, "user2@test.com")

        h1 = {"Authorization": f"Bearer {one['tokens']['access_token']}"}
        h2 = {"Authorization": f"Bearer {two['tokens']['access_token']}"}

        rooms = (await client.get("/rooms/public", headers=h1)).json()
        if not rooms:
            raise SystemExit("No hay rooms. Ejecuta antes seed_two_users.py")
        room_id = rooms[0]["id"]

        notes = (await client.get("/notes", headers=h1)).json()
        if not notes["items"]:
            raise SystemExit("No hay apuntes. Sube uno desde la UI antes de capturar.")
        note_id = notes["items"][0]["note"]["id"]

        # La reseña la deja user2: el backend rechaza valorar lo propio
        review = await client.post(
            f"/notes/{note_id}/reviews",
            headers=h2,
            json={"rating": 5, "comment": "Justo lo que necesitaba para el parcial."},
        )
        if review.status_code not in (201, 409, 422):
            print(f"  [WARN] reseña no creada: {review.status_code} {review.text[:120]}")

        return {"session": one, "room_id": room_id, "note_id": note_id}


async def main():
    data = await prepare_data()
    session, room_id, note_id = data["session"], data["room_id"], data["note_id"]

    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out_dir = os.path.join(repo_root, "docs", "evidence", "prompt-08")
    os.makedirs(out_dir, exist_ok=True)

    storage = {
        "studysync.accessToken": session["tokens"]["access_token"],
        "studysync.refreshToken": session["tokens"]["refresh_token"],
        "studysync.user": json.dumps(
            {
                "id": session["user"]["id"],
                "email": session["user"]["email"],
                "display_name": session["user"]["display_name"],
            }
        ),
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
            ],
        )
        ctx = await browser.new_context(
            permissions=["camera", "microphone"], viewport={"width": 1280, "height": 900}
        )
        # La sesión tiene que estar puesta antes de que arranque la app
        await ctx.add_init_script(
            "".join(
                f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});"
                for k, v in storage.items()
            )
        )
        page = await ctx.new_page()

        try:
            print("[1/3] Pomodoro en marcha...")
            await page.goto(f"{WEB}/rooms/{room_id}", wait_until="networkidle")
            start = page.get_by_role("button", name="Iniciar")
            if await start.count() > 0:
                await start.first.click()
                await page.wait_for_timeout(2500)
            await page.screenshot(path=os.path.join(out_dir, "pomodoro_running.png"))
            print("  [OK] pomodoro_running.png")

            print("[2/3] Listado de apuntes...")
            await page.goto(f"{WEB}/notes", wait_until="networkidle")
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(out_dir, "notes_list.png"))
            print("  [OK] notes_list.png")

            print("[3/3] Detalle con reseñas...")
            await page.goto(f"{WEB}/notes/{note_id}", wait_until="networkidle")
            await page.wait_for_timeout(800)
            await page.screenshot(
                path=os.path.join(out_dir, "note_detail.png"), full_page=True
            )
            print("  [OK] note_detail.png")

            # No dejar un temporizador de 25 minutos corriendo en la sala
            await page.goto(f"{WEB}/rooms/{room_id}", wait_until="networkidle")
            stop = page.get_by_role("button", name="Parar")
            if await stop.count() > 0:
                await stop.first.click()
                await page.wait_for_timeout(500)
                print("  [OK] pomodoro detenido")
        finally:
            await browser.close()

    print(f"\nCapturas en {out_dir}")


asyncio.run(main())
