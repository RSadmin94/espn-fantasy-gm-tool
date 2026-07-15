from __future__ import annotations

import wave
from io import BytesIO

from app.config import Settings


def test_synthesize_returns_valid_wav(auth_client):
    response = auth_client.post(
        "/synthesize",
        json={
            "voice": "roxanne",
            "text": "Tony Dorsey just reached for Josh Allen.",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert len(response.content) > 44

    with wave.open(BytesIO(response.content), "rb") as wav:
        assert wav.getnchannels() >= 1
        assert wav.getframerate() == 24000
        assert wav.getnframes() > 0


def test_invalid_voice_returns_400(auth_client):
    response = auth_client.post(
        "/synthesize",
        json={"voice": "not-a-voice", "text": "hello"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid request"


def test_synthesize_requires_bearer_token(client, monkeypatch, test_settings):
    token_settings = Settings(
        port=test_settings.port,
        hf_home=test_settings.hf_home,
        model_name=test_settings.model_name,
        cache_dir=test_settings.cache_dir,
        lang_code=test_settings.lang_code,
        sample_rate=test_settings.sample_rate,
        service_token="secret",
    )
    monkeypatch.setattr("app.main.settings", token_settings)
    response = client.post("/synthesize", json={"voice": "sofia", "text": "hello"})
    assert response.status_code == 401
    assert response.json()["detail"] == "unauthorized"


def test_empty_text_rejected(auth_client):
    response = auth_client.post("/synthesize", json={"voice": "sofia", "text": ""})
    assert response.status_code == 422
