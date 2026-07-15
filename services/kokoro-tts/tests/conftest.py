"""Shared test helpers."""
from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.synthesizer import SynthesizerService


class FakeBackend:
    is_loaded = True

    def load(self) -> float:
        return 0.0

    def synthesize(self, text: str, kokoro_voice: str) -> np.ndarray:
        duration = max(0.05, len(text) * 0.002)
        samples = int(24000 * duration)
        tone = 0.1 * np.sin(np.linspace(0, 8 * np.pi, samples, dtype=np.float32))
        return tone.astype(np.float32)


@pytest.fixture
def test_settings(tmp_path):
    hf_home = tmp_path / "hf"
    cache_dir = tmp_path / "cache"
    return Settings(
        port=8080,
        hf_home=hf_home,
        model_name="hexgrad/Kokoro-82M",
        cache_dir=cache_dir,
        lang_code="a",
        sample_rate=24000,
        service_token=None,
    )


@pytest.fixture
def auth_client(monkeypatch, test_settings):
    token_settings = Settings(
        port=test_settings.port,
        hf_home=test_settings.hf_home,
        model_name=test_settings.model_name,
        cache_dir=test_settings.cache_dir,
        lang_code=test_settings.lang_code,
        sample_rate=test_settings.sample_rate,
        service_token="test-token",
    )
    fake = FakeBackend()
    service = SynthesizerService(token_settings, backend=fake)
    monkeypatch.setattr("app.main.settings", token_settings)
    monkeypatch.setattr("app.main.synthesizer", service)
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": "Bearer test-token"})
        yield test_client


@pytest.fixture
def client(monkeypatch, test_settings):
    fake = FakeBackend()
    service = SynthesizerService(test_settings, backend=fake)
    monkeypatch.setattr("app.main.settings", test_settings)
    monkeypatch.setattr("app.main.synthesizer", service)
    with TestClient(app) as test_client:
        yield test_client
