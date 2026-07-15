"""Service configuration from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


MAX_TEXT_LENGTH = 500


@dataclass(frozen=True)
class Settings:
    port: int
    hf_home: Path
    model_name: str
    cache_dir: Path
    lang_code: str
    sample_rate: int
    service_token: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        port = int(os.getenv("PORT", "8080"))
        hf_home = Path(os.getenv("HF_HOME", "/data/huggingface"))
        model_name = os.getenv("MODEL_NAME", "hexgrad/Kokoro-82M")
        cache_dir = Path(os.getenv("CACHE_DIR", "/data/cache"))
        lang_code = os.getenv("KOKORO_LANG_CODE", "a")
        sample_rate = int(os.getenv("KOKORO_SAMPLE_RATE", "24000"))
        token = os.getenv("TTS_SERVICE_TOKEN")
        service_token = token.strip() if token and token.strip() else None
        return cls(
            port=port,
            hf_home=hf_home,
            model_name=model_name,
            cache_dir=cache_dir,
            lang_code=lang_code,
            sample_rate=sample_rate,
            service_token=service_token,
        )

    def ensure_directories(self) -> None:
        self.hf_home.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def apply_hf_env(self) -> None:
        os.environ.setdefault("HF_HOME", str(self.hf_home))
        os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(self.hf_home / "hub"))
