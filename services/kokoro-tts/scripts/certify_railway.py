"""Railway certification runner for Kokoro TTS."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import wave
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_TEXT = "Tony Dorsey just reached for Josh Allen."
VOICES = ("sofia", "coach", "roxanne")


@dataclass
class VoiceResult:
    voice: str
    uncached_ms: float
    cached_ms: float
    wav_bytes: int
    wav_path: Path | None = None


@dataclass
class CertReport:
    base_url: str
    cold_startup_ms: float | None = None
    model_loaded: bool = False
    voices: list[VoiceResult] = field(default_factory=list)
    restart_cache_ok: bool = False
    memory_mb: float | None = None
    errors: list[str] = field(default_factory=list)


def _request(
    method: str,
    url: str,
    token: str | None = None,
    payload: dict | None = None,
    timeout: float = 600,
) -> tuple[int, bytes, dict[str, str], float]:
    headers = {"Accept": "*/*"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    with urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        elapsed_ms = (time.perf_counter() - started) * 1000
        header_map = {k.lower(): v for k, v in resp.headers.items()}
        return resp.status, body, header_map, elapsed_ms


def wait_for_health(base_url: str, timeout_s: float = 900) -> tuple[dict, float]:
    deadline = time.perf_counter() + timeout_s
    started = time.perf_counter()
    last_error = "unknown"
    while time.perf_counter() < deadline:
        try:
            status, body, _, _ = _request("GET", f"{base_url}/health")
            if status == 200:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("status") == "ok" and payload.get("model_loaded") is True:
                    return payload, (time.perf_counter() - started) * 1000
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
        time.sleep(5)
    raise TimeoutError(f"health not ready after {timeout_s}s: {last_error}")


def assert_wav(data: bytes) -> None:
    if len(data) <= 44:
        raise ValueError("wav payload too small")
    with wave.open(BytesIO(data), "rb") as wav:
        if wav.getnchannels() < 1 or wav.getframerate() != 24000 or wav.getnframes() <= 0:
            raise ValueError("invalid wav format")


def synthesize(base_url: str, token: str, voice: str, text: str) -> tuple[bytes, float]:
    status, body, headers, elapsed_ms = _request(
        "POST",
        f"{base_url}/synthesize",
        token=token,
        payload={"voice": voice, "text": text},
    )
    if status != 200:
        raise RuntimeError(f"synthesize failed voice={voice} status={status} body={body[:200]!r}")
    if not headers.get("content-type", "").startswith("audio/wav"):
        raise RuntimeError(f"unexpected content-type for voice={voice}: {headers.get('content-type')}")
    assert_wav(body)
    return body, elapsed_ms


def run_cert(base_url: str, token: str, output_dir: Path, text: str) -> CertReport:
    report = CertReport(base_url=base_url.rstrip("/"))
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"waiting for health at {report.base_url}/health ...")
    health, startup_ms = wait_for_health(report.base_url)
    report.cold_startup_ms = startup_ms
    report.model_loaded = bool(health.get("model_loaded"))
    print(f"health ok startup_ms={startup_ms:.1f} payload={health}")

    first_bytes: dict[str, bytes] = {}
    for voice in VOICES:
        print(f"synthesizing uncached voice={voice}")
        wav, uncached_ms = synthesize(report.base_url, token, voice, text)
        out = output_dir / f"{voice}.wav"
        out.write_bytes(wav)
        print(f"synthesizing cached voice={voice}")
        wav_cached, cached_ms = synthesize(report.base_url, token, voice, text)
        if wav_cached != wav:
            raise RuntimeError(f"cache mismatch for voice={voice}")
        first_bytes[voice] = wav
        report.voices.append(
            VoiceResult(
                voice=voice,
                uncached_ms=uncached_ms,
                cached_ms=cached_ms,
                wav_bytes=len(wav),
                wav_path=out,
            )
        )
        print(
            f"voice={voice} uncached_ms={uncached_ms:.1f} cached_ms={cached_ms:.1f} bytes={len(wav)}"
        )

    return report, first_bytes


def verdict(report: CertReport) -> str:
    if report.errors:
        return "NOT VIABLE ON RAILWAY CPU"
    uncached = [v.uncached_ms for v in report.voices]
    cached = [v.cached_ms for v in report.voices]
    if not uncached:
        return "NOT VIABLE ON RAILWAY CPU"
    max_uncached = max(uncached)
    max_cached = max(cached)
    if max_uncached > 15000 or not report.model_loaded:
        return "NOT VIABLE ON RAILWAY CPU"
    if max_uncached > 5000 or max_cached > 1000:
        return "NEEDS PERFORMANCE WORK"
    return "READY FOR NODE INTEGRATION"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("TTS_BASE_URL"))
    parser.add_argument("--token", default=os.getenv("TTS_SERVICE_TOKEN"))
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parents[2] / "cert-output" / "kokoro-tts"),
    )
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--report", default="")
    args = parser.parse_args()

    if not args.base_url or not args.token:
        print("TTS_BASE_URL and TTS_SERVICE_TOKEN are required", file=sys.stderr)
        return 2

    report, _ = run_cert(args.base_url, args.token, Path(args.output_dir), args.text)
    final = verdict(report)
    report_path = Path(args.report) if args.report else Path(args.output_dir) / "cert-report.json"
    report_path.write_text(
        json.dumps(
            {
                "base_url": report.base_url,
                "cold_startup_ms": report.cold_startup_ms,
                "model_loaded": report.model_loaded,
                "voices": [
                    {
                        "voice": v.voice,
                        "uncached_ms": v.uncached_ms,
                        "cached_ms": v.cached_ms,
                        "wav_bytes": v.wav_bytes,
                        "wav_path": str(v.wav_path) if v.wav_path else None,
                    }
                    for v in report.voices
                ],
                "restart_cache_ok": report.restart_cache_ok,
                "memory_mb": report.memory_mb,
                "verdict": final,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("verdict:", final)
    print("report:", report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
