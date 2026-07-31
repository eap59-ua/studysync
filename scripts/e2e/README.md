# Scripts E2E

Scripts manuales de extremo a extremo. **No forman parte de la suite automática**
(`pytest` / `vitest`): requieren la stack levantada y credenciales reales de LiveKit.

## Requisitos

```bash
docker compose up -d              # Postgres + Redis
cd backend && uvicorn app.main:app --reload
cd web && npm run dev             # http://localhost:5173
pip install playwright httpx && playwright install chromium
```

## Scripts

| Script | Qué hace |
|---|---|
| `seed_two_users.py` | Registra `user1@test.com` y `user2@test.com`, crea un room público y mete a los dos. Es el *setup* de los demás. |
| `browser_two_users.py` | Playwright con dos contextos aislados. Verifica badge WS "Conectado" en ambos, presencia mutua en el MemberList y que `RoomVideoGrid` no rompa. Guarda capturas en `docs/evidence/prompt-07/`. |
| `check_livekit_token.py` | Pide un token de LiveKit para el room de prueba y valida la respuesta del endpoint. |

## Uso

```bash
python scripts/e2e/seed_two_users.py
python scripts/e2e/browser_two_users.py    # exit 0 si pasan los checks críticos
python scripts/e2e/check_livekit_token.py
```

## Limitación conocida

`browser_two_users.py` marca el check del grid de vídeo como **no crítico**
(`video_grid_no_error = True  # Don't fail for this`). Con LiveKit caído el script
puede salir con código 0. Ver `docs/reports/07-e2e-report.md`.
