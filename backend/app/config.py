"""StudySync backend configuration — loaded from environment variables."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Valores de desarrollo. Se declaran aquí para poder rechazarlos explícitamente
# en producción en vez de compararlos con literales repartidos por el fichero.
DEV_JWT_SECRET = "change-this-in-production"
DEV_LIVEKIT_KEY = "devkey"
DEV_LIVEKIT_SECRET = "secret"

# HS256 con una clave más corta que su propio digest no aporta la seguridad que
# el algoritmo promete.
MIN_JWT_SECRET_LENGTH = 32

LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")


def _is_local(url: str) -> bool:
    return any(host in url for host in LOCAL_HOSTS)


class Settings(BaseSettings):
    """Application settings. Values are read from .env or environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────
    database_url: str = (
        "postgresql+asyncpg://studysync:studysync_dev@localhost:5432/studysync"
    )

    # ── Redis ─────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────────
    jwt_secret: str = DEV_JWT_SECRET
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── LiveKit ───────────────────────────────────────────────
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = ""

    # ── App ───────────────────────────────────────────────────
    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    uploads_dir: str = "./uploads"

    # ── Demo ──────────────────────────────────────────────────
    # Desactivado por defecto: el endpoint de invitado emite sesiones sin pedir
    # credenciales, así que solo debe existir donde se quiere una demo pública.
    demo_mode_enabled: bool = False
    # Asientos del pool. Dos visitantes con la misma cuenta se cuentan como una
    # sola persona en la presencia y la demo del Pomodoro pierde la gracia.
    demo_seats: int = 4

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _reject_development_values_in_production(self) -> "Settings":
        """Impide arrancar en producción con configuración de desarrollo.

        Se acumulan todos los problemas y se lanzan juntos: descubrirlos de uno
        en uno significa un despliegue fallido por cada variable mal puesta.
        """
        if not self.is_production:
            return self

        problems: list[str] = []

        if self.jwt_secret == DEV_JWT_SECRET:
            problems.append("JWT_SECRET sigue siendo el valor de desarrollo.")
        elif len(self.jwt_secret) < MIN_JWT_SECRET_LENGTH:
            problems.append(
                f"JWT_SECRET necesita al menos {MIN_JWT_SECRET_LENGTH} caracteres "
                f"(tiene {len(self.jwt_secret)})."
            )

        if _is_local(self.database_url):
            problems.append("DATABASE_URL apunta a la máquina local.")
        if not self.database_url.startswith("postgresql+asyncpg://"):
            problems.append(
                "DATABASE_URL debe usar el driver asyncpg "
                "(postgresql+asyncpg://). Neon la entrega como postgresql://."
            )

        if _is_local(self.redis_url):
            problems.append("REDIS_URL apunta a la máquina local.")

        if not (self.livekit_api_key and self.livekit_api_secret and self.livekit_url):
            problems.append(
                "LIVEKIT_API_KEY, LIVEKIT_API_SECRET y LIVEKIT_URL son obligatorias."
            )
        else:
            if (
                self.livekit_api_key == DEV_LIVEKIT_KEY
                or self.livekit_api_secret == DEV_LIVEKIT_SECRET
            ):
                problems.append(
                    "LIVEKIT_API_KEY/LIVEKIT_API_SECRET son las de desarrollo del "
                    "livekit-server local."
                )
            if not self.livekit_url.startswith("wss://"):
                problems.append(
                    "LIVEKIT_URL debe ser wss://. Un ws:// desde una página servida "
                    "por HTTPS lo bloquea el navegador sin dar un error claro."
                )

        origins = self.cors_origins_list
        if not origins:
            problems.append("CORS_ORIGINS no puede estar vacío en producción.")
        if "*" in origins:
            problems.append(
                "CORS_ORIGINS no admite comodín con credenciales activadas."
            )
        if any(_is_local(origin) for origin in origins):
            problems.append("CORS_ORIGINS contiene orígenes locales.")
        if any(
            not origin.startswith("https://") for origin in origins if origin != "*"
        ):
            problems.append("CORS_ORIGINS solo admite orígenes https:// en producción.")

        if problems:
            listado = "\n".join(f"  - {p}" for p in problems)
            raise ValueError(
                "Configuración de producción inválida:\n"
                f"{listado}\n"
                "Revisa las variables de entorno del servicio antes de desplegar."
            )

        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
