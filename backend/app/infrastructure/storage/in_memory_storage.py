"""In-memory file storage adapter for testing."""

import io
from typing import AsyncIterator
from uuid import uuid4

from app.application.ports import FileStoragePort, SavedFile


class InMemoryFileStorage(FileStoragePort):
    def __init__(self):
        self._storage: dict[str, bytes] = {}

    async def save(
        self,
        *,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> SavedFile:
        ext = original_filename.split(".")[-1] if "." in original_filename else "bin"
        storage_key = f"{uuid4()}.{ext}"
        self._storage[storage_key] = file_bytes
        
        return SavedFile(
            url=f"http://testserver/uploads/{storage_key}",
            size_bytes=len(file_bytes),
            content_type=content_type,
            storage_key=storage_key,
        )

    async def delete(self, storage_key: str) -> None:
        self._storage.pop(storage_key, None)

    async def open_stream(self, storage_key: str) -> AsyncIterator[bytes]:
        data = self._storage.get(storage_key)
        if data is None:
            raise FileNotFoundError(f"File {storage_key} not found")
        
        # Simula streaming
        chunk_size = 1024 * 1024  # 1MB
        stream = io.BytesIO(data)
        while chunk := stream.read(chunk_size):
            yield chunk
