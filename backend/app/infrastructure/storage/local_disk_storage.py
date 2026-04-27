"""Local disk file storage adapter for development."""

import io
import os
from pathlib import Path
from typing import AsyncIterator
from uuid import uuid4

import aiofiles

from app.application.ports import FileStoragePort, SavedFile


class LocalDiskFileStorage(FileStoragePort):
    def __init__(self, base_dir: str, base_url: str):
        self.base_dir = Path(base_dir)
        self.base_url = base_url.rstrip("/")
        
        # Ensure directory exists
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(
        self,
        *,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> SavedFile:
        ext = original_filename.split(".")[-1] if "." in original_filename else "bin"
        # Validate extension to prevent weird files, though we already validate mime type in service
        
        storage_key = f"{uuid4()}.{ext}"
        file_path = self.base_dir / storage_key
        
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_bytes)
            
        return SavedFile(
            url=f"{self.base_url}/{storage_key}",
            size_bytes=len(file_bytes),
            content_type=content_type,
            storage_key=storage_key,
        )

    async def delete(self, storage_key: str) -> None:
        file_path = self.base_dir / storage_key
        if file_path.exists():
            # TODO: Handle potential errors gracefully
            os.remove(file_path)

    async def open_stream(self, storage_key: str) -> AsyncIterator[bytes]:
        file_path = self.base_dir / storage_key
        if not file_path.exists():
            raise FileNotFoundError(f"File {storage_key} not found")
            
        chunk_size = 1024 * 1024  # 1MB
        async with aiofiles.open(file_path, "rb") as f:
            while chunk := await f.read(chunk_size):
                yield chunk

# TODO: S3-compatible adapter using boto3 / aiobotocore for production
