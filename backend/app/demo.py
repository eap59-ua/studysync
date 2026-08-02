"""Convenciones del modo demo, compartidas entre el endpoint y el sembrado.

Viven aquí y no repartidas por el código para que la lista de cuentas del pool
sea una sola cosa: si el endpoint y el script de semilla no coincidieran, el
botón de invitado daría 503 sin explicar por qué.
"""

DEMO_DOMAIN = "studysync.app"
DEMO_PASSWORD = "DemoPass123!"

DEMO_ROOM_NAME = "Sala de estudio — Cálculo II"
DEMO_ROOM_SUBJECT = "Cálculo II"


def demo_email(seat: int) -> str:
    """Correo de la cuenta de demostración número `seat` (base 0)."""
    return f"demo{seat + 1}@{DEMO_DOMAIN}"


def demo_display_name(seat: int) -> str:
    return f"Invitado {seat + 1}"


def is_demo_email(email: str) -> bool:
    return email.endswith(f"@{DEMO_DOMAIN}") and email.startswith("demo")
