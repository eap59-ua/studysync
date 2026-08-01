"""
E2E Browser Test: Two users joining the same StudySync room.
Uses Playwright to verify:
  (a) Both appear in MemberList in real time
  (b) RoomVideoGrid connects without errors
  (c) Badge WS shows "Conectado"
"""
import asyncio
import sys
import os

# Force UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

# Clases que renderiza @livekit/components-react
LK_TILE = ".lk-participant-tile"
LK_STATE_TOAST = ".lk-toast-connection-state"


def track_livekit_ws(page, sink):
    """Observa el WebSocket que el cliente abre contra el servidor LiveKit.

    Es la señal más directa de que el vídeo funciona: el BUG 2 consistía
    exactamente en que esta conexión nunca llegaba a abrirse. Mirar el DOM no
    basta, porque el tile del participante se dibuja igualmente con la sala
    desconectada — así fue como el bug pasó desapercibido en junio.

    El WS de presencia del backend va por el 8000, así que filtrar por el 7880
    los distingue.
    """

    def on_websocket(ws):
        if ":7880" not in ws.url:
            return
        sink["opened"] = True
        sink["url"] = ws.url
        ws.on("close", lambda _: sink.__setitem__("closed", True))
        ws.on("socketerror", lambda err: sink.__setitem__("error", str(err)))

    page.on("websocket", on_websocket)


async def check_video_connected(page, label, lkws, results):
    """Comprueba que LiveKit conectó de verdad. Devuelve True solo si lo hizo.

    Antes todas las ramas de esta comprobación acababan en True, así que el
    script salía con código 0 con el vídeo caído (BUG 3 del informe del
    Prompt 7). Ahora cualquier estado que no sea "conectado" es un fallo.
    """
    if await page.locator("text=Video no disponible").count() > 0:
        detail = await page.locator("text=Video no disponible").first.text_content()
        print(f"  [FAIL] {label}: RoomVideoGrid en estado de error ({detail})")
        results["bugs"].append(f"{label}: RoomVideoGrid muestra 'Video no disponible'")
        return False

    if not lkws.get("opened"):
        print(f"  [FAIL] {label}: el cliente no abrió ningún WebSocket contra :7880")
        results["bugs"].append(
            f"{label}: sin WebSocket a LiveKit — ¿servidor caído o LIVEKIT_URL mal?"
        )
        return False

    if lkws.get("error"):
        print(f"  [FAIL] {label}: error en el WebSocket de LiveKit: {lkws['error']}")
        results["bugs"].append(f"{label}: WebSocket de LiveKit con error")
        return False

    if lkws.get("closed"):
        print(f"  [FAIL] {label}: el WebSocket de LiveKit se abrió y se cerró")
        results["bugs"].append(f"{label}: LiveKit se desconectó tras conectar")
        return False

    toast = page.locator(LK_STATE_TOAST)
    if await toast.count() > 0:
        state = (await toast.first.text_content() or "").strip()
        if state and state.lower() != "connected":
            print(f"  [FAIL] {label}: LiveKit en estado '{state}'")
            results["bugs"].append(f"{label}: LiveKit muestra '{state}'")
            return False

    try:
        await page.wait_for_selector(LK_TILE, timeout=20000)
    except Exception:
        print(f"  [FAIL] {label}: ningún '{LK_TILE}' tras 20 s")
        results["bugs"].append(f"{label}: LiveKit no renderizó ningún participante")
        return False

    tiles = await page.locator(LK_TILE).count()
    # Se recorta la query: lleva el access token y el join_request completos,
    # y un JWT no tiene por qué acabar en la salida de consola ni en un log de CI.
    endpoint = lkws["url"].split("?")[0]
    print(f"  [OK] {label}: LiveKit conectado ({tiles} tile(s), {endpoint})")
    return True


async def main():
    results = {
        "ws_badge_user1": False,
        "ws_badge_user2": False,
        "member_list_user1_sees_user2": False,
        "member_list_user2_sees_user1": False,
        "video_user1": False,
        "video_user2": False,
        "console_errors": [],
        "bugs": [],
    }

    # Las capturas se guardan como evidencia dentro del repo, no en una ruta absoluta
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    screenshots_dir = os.path.join(repo_root, "docs", "evidence", "prompt-07")
    os.makedirs(screenshots_dir, exist_ok=True)

    async with async_playwright() as p:
        # Chromium headless deniega cámara y micrófono por defecto, así que
        # LiveKit no podía publicar tracks. Los dispositivos falsos evitan además
        # depender de que la máquina donde corre el E2E tenga webcam.
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
            ],
        )

        # Two isolated browser contexts (separate localStorage)
        ctx1 = await browser.new_context(permissions=["camera", "microphone"])
        ctx2 = await browser.new_context(permissions=["camera", "microphone"])
        page1 = await ctx1.new_page()
        page2 = await ctx2.new_page()

        # Estado de los WebSocket contra LiveKit, poblado por los listeners
        lkws1, lkws2 = {}, {}
        track_livekit_ws(page1, lkws1)
        track_livekit_ws(page2, lkws2)

        # Capture console errors
        console_errors_1 = []
        console_errors_2 = []
        page1.on("console", lambda msg: console_errors_1.append(f"[user1] {msg.type}: {msg.text}") if msg.type == "error" else None)
        page2.on("console", lambda msg: console_errors_2.append(f"[user2] {msg.type}: {msg.text}") if msg.type == "error" else None)

        try:
            # --- Step 1: Login user1 ---
            print("[1/7] Logging in user1@test.com...")
            await page1.goto("http://localhost:5173/login", wait_until="networkidle")
            await page1.fill('input[type="email"]', 'user1@test.com')
            await page1.fill('input[type="password"]', 'TestPass123!')
            await page1.click('button[type="submit"]')
            await page1.wait_for_url("**/dashboard**", timeout=10000)
            print("  [OK] user1 logged in -> /dashboard")

            # --- Step 2: Login user2 ---
            print("[2/7] Logging in user2@test.com...")
            await page2.goto("http://localhost:5173/login", wait_until="networkidle")
            await page2.fill('input[type="email"]', 'user2@test.com')
            await page2.fill('input[type="password"]', 'TestPass123!')
            await page2.click('button[type="submit"]')
            await page2.wait_for_url("**/dashboard**", timeout=10000)
            print("  [OK] user2 logged in -> /dashboard")

            # --- Step 3: User1 navigates to rooms and creates a room ---
            print("[3/7] User1 creating a room...")
            await page1.goto("http://localhost:5173/rooms", wait_until="networkidle")
            await asyncio.sleep(1)

            # Click "Nueva Sala" button
            new_room_btn = page1.get_by_text("Nueva Sala")
            if await new_room_btn.count() > 0:
                await new_room_btn.first.click()
                await asyncio.sleep(1)

                # Fill dialog form
                name_input = page1.locator('input[name="name"]')
                if await name_input.count() > 0:
                    await name_input.fill("E2E Real-Time Room")
                    subject_input = page1.locator('input[name="subject"]')
                    if await subject_input.count() > 0:
                        await subject_input.fill("E2E Testing")
                    submit_btn = page1.locator('button[type="submit"]')
                    await submit_btn.click()
                    await page1.wait_for_url("**/rooms/*", timeout=10000)
                    room_url = page1.url
                    print(f"  [OK] Room created, URL: {room_url}")
                else:
                    print("  [WARN] Could not find room name input")
                    room_url = None
            else:
                print("  [WARN] 'Nueva Sala' button not found")
                room_url = None

            if not room_url:
                # Fallback: use existing room
                room_link = page1.locator('a[href*="/rooms/"]').first
                if await room_link.count() > 0:
                    await room_link.click()
                    await page1.wait_for_url("**/rooms/*", timeout=10000)
                    room_url = page1.url
                    print(f"  [OK] Navigated to existing room: {room_url}")
                else:
                    print("  [FAIL] No rooms available!")
                    return

            # --- Step 4: User1 waits for WS connection ---
            print("[4/7] Waiting for user1 WS connection...")
            try:
                conectado_badge = page1.get_by_text("Conectado")
                await conectado_badge.first.wait_for(state="visible", timeout=10000)
                results["ws_badge_user1"] = True
                print("  [OK] user1 WS badge: 'Conectado'")
            except Exception as e:
                print(f"  [FAIL] user1 WS badge not found: {e}")
                # Check what status is showing
                page_content = await page1.content()
                for status in ["Conectando...", "Reconectando...", "Desconectado"]:
                    if status in page_content:
                        print(f"    Found status: {status}")
                results["bugs"].append("WS badge not showing 'Conectado' for user1")

            # --- Step 5: User2 joins the same room ---
            print("[5/7] User2 navigating to same room...")
            await page2.goto(room_url, wait_until="networkidle")
            await asyncio.sleep(2)  # Wait for WS to connect

            try:
                conectado_badge2 = page2.get_by_text("Conectado")
                await conectado_badge2.first.wait_for(state="visible", timeout=10000)
                results["ws_badge_user2"] = True
                print("  [OK] user2 WS badge: 'Conectado'")
            except Exception as e:
                print(f"  [FAIL] user2 WS badge not found: {e}")
                results["bugs"].append("WS badge not showing 'Conectado' for user2")

            # --- Step 6: Verify MemberList presence ---
            print("[6/7] Verifying MemberList presence...")
            await asyncio.sleep(3)  # Give time for WS messages

            # User1 should see User Two
            try:
                await page1.wait_for_selector("text=User Two", timeout=8000)
                results["member_list_user1_sees_user2"] = True
                print("  [OK] user1 sees 'User Two' in MemberList")
            except Exception:
                print("  [FAIL] user1 does NOT see 'User Two' in MemberList")
                # Debug: check what members are visible
                member_text = await page1.locator("text=Conectados").first.text_content()
                print(f"    MemberList header: {member_text}")
                results["bugs"].append("user1 does not see User Two in MemberList")

            # User2 should see User One
            try:
                await page2.wait_for_selector("text=User One", timeout=8000)
                results["member_list_user2_sees_user1"] = True
                print("  [OK] user2 sees 'User One' in MemberList")
            except Exception:
                print("  [FAIL] user2 does NOT see 'User One' in MemberList")
                results["bugs"].append("user2 does not see User One in MemberList")

            # --- Step 7: Verify RoomVideoGrid ---
            print("[7/7] Verifying RoomVideoGrid...")
            await asyncio.sleep(2)

            results["video_user1"] = await check_video_connected(
                page1, "user1", lkws1, results
            )
            results["video_user2"] = await check_video_connected(
                page2, "user2", lkws2, results
            )

            # --- Screenshots ---
            print("\nTaking screenshots...")
            await page1.screenshot(path=os.path.join(screenshots_dir, "user1_room.png"), full_page=True)
            await page2.screenshot(path=os.path.join(screenshots_dir, "user2_room.png"), full_page=True)
            print("  Screenshots saved")

            # Collect console errors
            results["console_errors"] = console_errors_1 + console_errors_2

        except Exception as e:
            print(f"\n[FATAL ERROR] {e}")
            import traceback
            traceback.print_exc()
            try:
                await page1.screenshot(path=os.path.join(screenshots_dir, "error_user1.png"))
                await page2.screenshot(path=os.path.join(screenshots_dir, "error_user2.png"))
            except:
                pass
        finally:
            await browser.close()

    # --- Summary ---
    print("\n" + "="*60)
    print("E2E RESULTS SUMMARY")
    print("="*60)
    print(f"  WS Badge user1 'Conectado':        {'PASS' if results['ws_badge_user1'] else 'FAIL'}")
    print(f"  WS Badge user2 'Conectado':        {'PASS' if results['ws_badge_user2'] else 'FAIL'}")
    print(f"  user1 sees User Two in MemberList:  {'PASS' if results['member_list_user1_sees_user2'] else 'FAIL'}")
    print(f"  user2 sees User One in MemberList:  {'PASS' if results['member_list_user2_sees_user1'] else 'FAIL'}")
    print(f"  LiveKit conectado user1:            {'PASS' if results['video_user1'] else 'FAIL'}")
    print(f"  LiveKit conectado user2:            {'PASS' if results['video_user2'] else 'FAIL'}")

    if results["console_errors"]:
        print(f"\n  Console errors ({len(results['console_errors'])}):")
        for err in results["console_errors"][:10]:
            print(f"    {err}")

    if results["bugs"]:
        print(f"\n  Bugs found ({len(results['bugs'])}):")
        for bug in results["bugs"]:
            print(f"    BUG: {bug}")

    print("="*60)

    # Exit with error if any critical check failed.
    # El vídeo entra aquí desde el Prompt 8: un E2E que no falla con el vídeo
    # caído no es una puerta de calidad (BUG 3 del informe del Prompt 7).
    critical_pass = all([
        results["ws_badge_user1"],
        results["ws_badge_user2"],
        results["member_list_user1_sees_user2"],
        results["member_list_user2_sees_user1"],
        results["video_user1"],
        results["video_user2"],
    ])
    sys.exit(0 if critical_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
