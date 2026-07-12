"""Disk cache for synthesized WAV audio keyed by SHA256(voice + text)."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def cache_key(voice: str, text: str) -> str:
    payload = f"{voice.strip().lower()}{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def cache_path(cache_dir: Path, voice: str, text: str) -> Path:
    return cache_dir / f"{cache_key(voice, text)}.wav"


def read_cached(cache_dir: Path, voice: str, text: str) -> bytes | None:
    path = cache_path(cache_dir, voice, text)
    if not path.is_file():
        return None
    logger.info("cache hit voice=%s path=%s", voice, path)
    return path.read_bytes()


def write_cached(cache_dir: Path, voice: str, text: str, wav_bytes: bytes) -> Path:
    path = cache_path(cache_dir, voice, text)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(wav_bytes)
    logger.info("cache store voice=%s path=%s bytes=%d", voice, path, len(wav_bytes))
    return path
