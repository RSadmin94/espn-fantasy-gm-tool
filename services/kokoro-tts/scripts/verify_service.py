"""End-to-end verification against a running Kokoro TTS service."""
from __future__ import annotations

import hashlib
import json
import sys
import wave
from io import BytesIO
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
TEXT = "Tony Dorsey just reached for Josh Allen."
VOICE = "sofia"


def get(path: str) -> tuple[int, bytes, str]:
    with urlopen(f"{BASE}{path}", timeout=600) as resp:
        return resp.status, resp.read(), resp.headers.get("Content-Type", "")


def post_json(path: str, payload: dict) -> tuple[int, bytes, str]:
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        f"{BASE}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=600) as resp:
        return resp.status, resp.read(), resp.headers.get("Content-Type", "")


def assert_wav(data: bytes) -> None:
    assert len(data) > 44, "WAV payload too small"
    with wave.open(BytesIO(data), "rb") as wav:
        assert wav.getnchannels() >= 1
        assert wav.getframerate() == 24000
        assert wav.getnframes() > 0


def main() -> int:
    print(f"verify base={BASE}")

    status, body, ctype = get("/health")
    health = json.loads(body.decode("utf-8"))
    print("health", status, health)
    assert status == 200
    assert health["status"] == "ok"
    assert health["model_loaded"] is True

    payload = {"voice": VOICE, "text": TEXT}
    status, wav1, ctype = post_json("/synthesize", payload)
    print("synthesize miss", status, ctype, len(wav1))
    assert status == 200
    assert ctype.startswith("audio/wav")
    assert_wav(wav1)

    status, wav2, _ = post_json("/synthesize", payload)
    print("synthesize hit", status, len(wav2))
    assert status == 200
    assert wav1 == wav2

    digest = hashlib.sha256(f"{VOICE}{TEXT}".encode("utf-8")).hexdigest()
    print("cache key", digest)
    print("verification ok")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HTTPError as exc:
        print("HTTP error", exc.code, exc.read().decode("utf-8", errors="replace"))
        raise SystemExit(1)
    except URLError as exc:
        print("connection error", exc)
        raise SystemExit(1)
