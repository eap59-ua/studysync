"""Application ports."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator

@dataclass
class SavedFile:
    url: str
    size_bytes: int
    content_type: str
    storage_key: str

class FileStoragePort(ABC):
    @abstractmethod
    async def save(
        self,
        *,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> SavedFile:
        """Devuelve SavedFile(url, size_bytes, content_type, storage_key)."""

    @abstractmethod
    async def delete(self, storage_key: str) -> None:
        """Borra el archivo asociado."""

    @abstractmethod
    async def open_stream(self, storage_key: str) -> AsyncIterator[bytes]:
        """Devuelve el contenido del archivo en streaming (para descargas)."""
