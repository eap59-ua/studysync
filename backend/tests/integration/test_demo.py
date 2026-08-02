"""Acceso de invitado.

Un reclutador con veinte CVs encima no crea una cuenta. Sin esto, la URL pública
lleva a una pantalla de registro y el proyecto no se ve.

El endpoint emite una sesión sin contraseña, así que su superficie está acotada
a propósito: solo funciona si el modo demo está activado y solo para las cuentas
del pool sembrado.
"""

import pytest
from httpx import AsyncClient

from app.config import Settings, get_settings
from app.demo import demo_email
from app.main import app


@pytest.fixture
def demo_enabled():
    """Activa el modo demo sobreescribiendo la configuración de la app."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        environment="development", demo_mode_enabled=True, demo_seats=3
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


async def _register(client: AsyncClient, email: str, display_name: str):
    return await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "DemoPass123!", "display_name": display_name},
    )


@pytest.fixture
def demo_disabled():
    """Fija el modo demo apagado.

    No basta con los valores por defecto: `Settings` lee el `.env` del entorno,
    así que un desarrollador con DEMO_MODE_ENABLED=true en local vería este test
    en verde por la razón equivocada. La prueba fija lo que dice probar.
    """
    app.dependency_overrides[get_settings] = lambda: Settings(
        environment="development", demo_mode_enabled=False
    )
    yield
    app.dependency_overrides.pop(get_settings, None)


class TestModoDemoDesactivado:
    async def test_devuelve_404_si_el_modo_demo_no_esta_activado(
        self, client: AsyncClient, demo_disabled
    ):
        # En una instalación normal este endpoint no debe existir siquiera
        response = await client.post("/api/v1/auth/demo")

        assert response.status_code == 404


class TestModoDemoActivado:
    async def test_emite_una_sesion_sin_pedir_credenciales(
        self, client: AsyncClient, demo_enabled
    ):
        await _register(client, demo_email(0), "Invitado 1")

        response = await client.post("/api/v1/auth/demo")

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["user"]["email"].endswith("@studysync.app")

    async def test_el_token_emitido_sirve_para_autenticarse(
        self, client: AsyncClient, demo_enabled
    ):
        await _register(client, demo_email(0), "Invitado 1")

        token = (await client.post("/api/v1/auth/demo")).json()["access_token"]
        me = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )

        assert me.status_code == 200
        assert me.json()["email"].endswith("@studysync.app")

    async def test_reparte_asientos_distintos_entre_visitantes(
        self, client: AsyncClient, demo_enabled
    ):
        # Si dos visitantes compartieran cuenta, la presencia los contaría como
        # una sola persona y la demo del Pomodoro sincronizado no se vería.
        for seat in range(3):
            await _register(client, demo_email(seat), f"Invitado {seat + 1}")

        emails = set()
        for _ in range(25):
            response = await client.post("/api/v1/auth/demo")
            emails.add(response.json()["user"]["email"])

        assert len(emails) > 1, "todas las sesiones cayeron en la misma cuenta"
        assert emails <= {demo_email(s) for s in range(3)}

    async def test_avisa_si_la_demo_no_esta_sembrada(
        self, client: AsyncClient, demo_enabled
    ):
        # Sin datos sembrados el endpoint no puede inventarse la cuenta; que
        # falle claro es mejor que un 500 opaco
        response = await client.post("/api/v1/auth/demo")

        assert response.status_code == 503
        assert "seed" in response.json()["detail"].lower()
