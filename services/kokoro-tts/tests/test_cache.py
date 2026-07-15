from __future__ import annotations

import wave
from io import BytesIO

from app.cache import cache_path, read_cached, write_cached


def test_cache_miss_then_store(auth_client, test_settings):
    voice = "sofia"
    text = "Tony Dorsey just reached for Josh Allen."
    assert read_cached(test_settings.cache_dir, voice, text) is None

    response = auth_client.post("/synthesize", json={"voice": voice, "text": text})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")

    cached = read_cached(test_settings.cache_dir, voice, text)
    assert cached is not None
    assert cached == response.content


def test_cache_hit_returns_cached_file(auth_client, test_settings):
    voice = "coach"
    text = "Historic moment in the war room."
    prewritten = write_cached(
        test_settings.cache_dir,
        voice,
        text,
        _minimal_wav_bytes(),
    )

    response = auth_client.post("/synthesize", json={"voice": voice, "text": text})
    assert response.status_code == 200
    assert response.content == prewritten.read_bytes()


def test_cache_key_is_stable(test_settings):
    path_a = cache_path(test_settings.cache_dir, "sofia", "hello")
    path_b = cache_path(test_settings.cache_dir, "sofia", "hello")
    path_c = cache_path(test_settings.cache_dir, "coach", "hello")
    assert path_a == path_b
    assert path_a != path_c


def _minimal_wav_bytes() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b"\x00\x00" * 2400)
    return buffer.getvalue()
