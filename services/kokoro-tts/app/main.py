"""FastAPI entrypoint for the RFSN Kokoro TTS microservice."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .cache import read_cached, write_cached
from .config import MAX_TEXT_LENGTH, Settings
from .logging_config import configure_logging
from .synthesizer import SynthesizerService

logger = logging.getLogger(__name__)

settings = Settings.from_env()
synthesizer = SynthesizerService(settings)


class SynthesizeRequest(BaseModel):
    voice: str = Field(..., min_length=1, max_length=32)
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    expected = settings.service_token
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    token = authorization.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    logger.info("startup port=%s model=%s cache_dir=%s", settings.port, settings.model_name, settings.cache_dir)
    settings.ensure_directories()
    settings.apply_hf_env()
    started = time.perf_counter()
    load_ms = synthesizer.warmup()
    logger.info("startup model warmup complete load_ms=%.1f total_startup_ms=%.1f", load_ms, (time.perf_counter() - started) * 1000)
    yield
    logger.info("shutdown")


app = FastAPI(title="RFSN Kokoro TTS", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model_loaded": synthesizer.model_loaded,
    }


@app.post("/synthesize")
def synthesize(body: SynthesizeRequest, _: None = Depends(require_service_token)) -> Response:
    voice = body.voice.strip().lower()
    text = body.text.strip()
    if not voice or not text:
        raise HTTPException(status_code=422, detail="voice and text are required")

    cached = read_cached(settings.cache_dir, voice, text)
    if cached is not None:
        return Response(content=cached, media_type="audio/wav")

    logger.info("cache miss voice=%s chars=%d", voice, len(text))
    try:
        wav_bytes = synthesizer.synthesize_wav(voice, text)
    except ValueError as exc:
        logger.warning("invalid synthesis request voice=%s error=%s", voice, exc)
        raise HTTPException(status_code=400, detail="invalid request") from exc
    except Exception as exc:
        logger.exception("synthesis error voice=%s", voice)
        raise HTTPException(status_code=500, detail="synthesis failed") from exc

    write_cached(settings.cache_dir, voice, text, wav_bytes)
    return Response(content=wav_bytes, media_type="audio/wav")


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Any, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
