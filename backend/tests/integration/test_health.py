"""El healthcheck es de lo que depende Render para saber si el servicio vive."""

from httpx import AsyncClient


async def test_health_responde_ok(client: AsyncClient):
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_health_no_necesita_autenticacion(client: AsyncClient):
    # Render lo llama sin credenciales; si exigiera token, marcaría el servicio
    # como caído y lo reiniciaría en bucle.
    response = await client.get("/health")

    assert response.status_code == 200
