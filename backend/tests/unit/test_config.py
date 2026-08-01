"""La configuración de producción no puede arrancar con valores de desarrollo.

Un JWT_SECRET por defecto en producción no es un descuido de configuración: es
una vulnerabilidad, porque cualquiera que lea el repositorio puede firmar tokens
válidos. Estas comprobaciones existen para que el fallo ocurra al arrancar y no
en silencio.
"""

import pytest

from app.config import Settings

PROD_OK = {
    "environment": "production",
    "jwt_secret": "u" * 48,
    "database_url": "postgresql+asyncpg://user:pw@ep-x.eu-central-1.aws.neon.tech/db",
    "redis_url": "rediss://default:pw@eu2-x.upstash.io:6379",
    "livekit_api_key": "APIabcdefghijkl",
    "livekit_api_secret": "s" * 43,
    "livekit_url": "wss://studysync.livekit.cloud",
    "cors_origins": "https://studysync.vercel.app",
}


def build(**overrides) -> Settings:
    return Settings(**{**PROD_OK, **overrides})


class TestProduccion:
    def test_acepta_una_configuracion_completa(self):
        settings = build()
        assert settings.environment == "production"
        assert settings.is_production

    def test_rechaza_el_jwt_secret_por_defecto(self):
        with pytest.raises(ValueError, match="JWT_SECRET"):
            build(jwt_secret="change-this-in-production")

    def test_rechaza_un_jwt_secret_corto(self):
        # 32 bytes es el mínimo razonable para HS256
        with pytest.raises(ValueError, match="JWT_SECRET"):
            build(jwt_secret="corto")

    def test_rechaza_una_base_de_datos_local(self):
        with pytest.raises(ValueError, match="DATABASE_URL"):
            build(
                database_url="postgresql+asyncpg://studysync:x@localhost:5432/studysync"
            )

    def test_rechaza_un_driver_sincrono(self):
        # SQLAlchemy async necesita asyncpg; Neon da la URL como postgresql://
        with pytest.raises(ValueError, match="asyncpg"):
            build(database_url="postgresql://user:pw@ep-x.neon.tech/db")

    def test_rechaza_un_redis_local(self):
        with pytest.raises(ValueError, match="REDIS_URL"):
            build(redis_url="redis://localhost:6379/0")

    def test_rechaza_las_claves_de_desarrollo_de_livekit(self):
        with pytest.raises(ValueError, match="LIVEKIT"):
            build(livekit_api_key="devkey", livekit_api_secret="secret")

    def test_rechaza_livekit_sin_configurar(self):
        with pytest.raises(ValueError, match="LIVEKIT"):
            build(livekit_api_key="", livekit_api_secret="", livekit_url="")

    def test_rechaza_livekit_sin_tls(self):
        # ws:// desde una página https lo bloquea el navegador sin error claro
        with pytest.raises(ValueError, match="LIVEKIT_URL"):
            build(livekit_url="ws://livekit.example.com")

    def test_rechaza_el_comodin_en_cors(self):
        with pytest.raises(ValueError, match="CORS_ORIGINS"):
            build(cors_origins="*")

    def test_rechaza_localhost_en_cors(self):
        with pytest.raises(ValueError, match="CORS_ORIGINS"):
            build(cors_origins="https://studysync.vercel.app,http://localhost:5173")

    def test_rechaza_cors_sin_tls(self):
        with pytest.raises(ValueError, match="CORS_ORIGINS"):
            build(cors_origins="http://studysync.vercel.app")

    def test_acumula_todos_los_problemas_en_un_solo_error(self):
        # Arrancar, fallar, arreglar uno, repetir, es una pérdida de tiempo:
        # el mensaje tiene que decir todo lo que falta de una vez
        with pytest.raises(ValueError) as exc:
            build(jwt_secret="corto", cors_origins="*", livekit_url="ws://x.com")

        mensaje = str(exc.value)
        assert "JWT_SECRET" in mensaje
        assert "CORS_ORIGINS" in mensaje
        assert "LIVEKIT_URL" in mensaje


class TestDesarrollo:
    def test_los_valores_por_defecto_siguen_valiendo_en_local(self):
        # Si desarrollar exigiera rellenar diez variables, nadie clonaría el repo
        settings = Settings(environment="development")
        assert settings.is_dev
        assert "localhost" in settings.database_url

    def test_no_valida_nada_fuera_de_produccion(self):
        settings = Settings(environment="development", jwt_secret="x", cors_origins="*")
        assert settings.jwt_secret == "x"

    def test_los_origenes_cors_se_parten_y_se_limpian(self):
        settings = Settings(
            environment="development",
            cors_origins="http://localhost:5173 , http://localhost:3000",
        )
        assert settings.cors_origins_list == [
            "http://localhost:5173",
            "http://localhost:3000",
        ]
