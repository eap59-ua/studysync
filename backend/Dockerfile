# ── Stage 1: Builder ──────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Se copia también el paquete: `pip install .` necesita el código para construir
# la wheel, y sin él el build anterior caía al fallback silencioso `|| pip
# install .`, que acababa instalando las dependencias de desarrollo.
COPY pyproject.toml ./
COPY app ./app

# Sin `[dev]`: pytest, ruff, fakeredis y aiosqlite no pintan nada en producción.
# --prefix aísla lo instalado para poder copiarlo limpio a la imagen final.
RUN pip install --no-cache-dir --prefix=/install .

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM python:3.12-slim

# Usuario sin privilegios: si alguien escapa del proceso, no es root.
RUN groupadd -r studysync && useradd -r -g studysync studysync

WORKDIR /app

COPY --from=builder /install /usr/local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# El directorio de subidas tiene que existir y pertenecer al usuario del proceso.
# Ojo: en Render el disco es efímero, así que lo que se suba se pierde en cada
# despliegue. Está anotado en BACKLOG.md.
RUN mkdir -p /app/uploads && chown -R studysync:studysync /app

USER studysync

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen(f\"http://localhost:{os.environ.get('PORT','8000')}/health\")"

# Sin --reload: recarga en caliente en producción es un desperdicio de memoria y
# un vector de sorpresas. Render inyecta PORT, así que se lee del entorno.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
