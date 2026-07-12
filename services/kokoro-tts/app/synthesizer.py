"""Kokoro-82M synthesis wrapper."""
from __future__ import annotations

import io
import logging
import time
from typing import Any, Protocol

import numpy as np
import soundfile as sf

from .config import Settings
from .voices import resolve_kokoro_voice

logger = logging.getLogger(__name__)


class KokoroBackend(Protocol):
    def synthesize(self, text: str, kokoro_voice: str) -> np.ndarray: ...


class LiveKokoroBackend:
    """Loads Kokoro pipeline on first use; downloads weights from Hugging Face."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pipeline: Any | None = None

    @property
    def is_loaded(self) -> bool:
        return self._pipeline is not None

    def load(self) -> float:
        if self._pipeline is not None:
            return 0.0
        started = time.perf_counter()
        settings = self._settings
        settings.apply_hf_env()
        logger.info(
            "loading Kokoro model repo=%s lang=%s hf_home=%s",
            settings.model_name,
            settings.lang_code,
            settings.hf_home,
        )
        from kokoro import KPipeline  # lazy import — heavy dependency

        self._pipeline = KPipeline(
            lang_code=settings.lang_code,
            repo_id=settings.model_name,
        )
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info("model loaded in %.1fms", elapsed_ms)
        return elapsed_ms

    def synthesize(self, text: str, kokoro_voice: str) -> np.ndarray:
        if self._pipeline is None:
            self.load()
        assert self._pipeline is not None
        chunks: list[np.ndarray] = []
        generator = self._pipeline(text, voice=kokoro_voice, split_pattern=r"\n+")
        for result in generator:
            audio = result.audio
            if audio is None:
                continue
            arr = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
            chunks.append(arr.astype(np.float32, copy=False))
        if not chunks:
            raise RuntimeError("Kokoro produced no audio for the given text")
        return np.concatenate(chunks)


class SynthesizerService:
    def __init__(self, settings: Settings, backend: KokoroBackend | None = None) -> None:
        self._settings = settings
        self._backend: KokoroBackend = backend or LiveKokoroBackend(settings)

    @property
    def model_loaded(self) -> bool:
        return getattr(self._backend, "is_loaded", True)

    def warmup(self) -> float:
        loader = getattr(self._backend, "load", None)
        if callable(loader):
            return float(loader())
        return 0.0

    def synthesize_wav(self, logical_voice: str, text: str) -> bytes:
        kokoro_voice = resolve_kokoro_voice(logical_voice)
        started = time.perf_counter()
        audio = self._backend.synthesize(text, kokoro_voice)
        buffer = io.BytesIO()
        sf.write(buffer, audio, self._settings.sample_rate, format="WAV")
        wav_bytes = buffer.getvalue()
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "synthesis complete voice=%s kokoro_voice=%s chars=%d ms=%.1f bytes=%d",
            logical_voice,
            kokoro_voice,
            len(text),
            elapsed_ms,
            len(wav_bytes),
        )
        return wav_bytes
