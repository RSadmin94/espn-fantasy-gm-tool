# RFSN Kokoro TTS (Phase 1)

Standalone Python microservice that synthesizes WAV audio from text using [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M). Intended for Railway deployment. **Not yet integrated** with the RFSN Node backend.

## API

### `GET /health`

```json
{
  "status": "ok",
  "model_loaded": true
}
```

### `POST /synthesize`

Request:

```json
{
  "voice": "sofia",
  "text": "Tony Dorsey just reached for Josh Allen."
}
```

Response: `audio/wav`

Logical voices (`sofia`, `coach`, `roxanne`) are mapped to Kokoro voice IDs in `app/voices.py`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `HF_HOME` | `/data/huggingface` | Hugging Face cache root |
| `MODEL_NAME` | `hexgrad/Kokoro-82M` | Kokoro model repo |
| `CACHE_DIR` | `/data/cache` | Disk cache for synthesized WAV files |

On first startup the service downloads model weights and voice packs from Hugging Face automatically.

## Python version

Kokoro `0.9.x` requires **Python 3.10–3.12**. The Docker image uses Python 3.11. Local Python 3.13+ cannot install the Kokoro package yet; use Docker for full integration verification.

## Local development

### Docker (recommended)

```bash
cd services/kokoro-tts
docker build -t rfsn-kokoro-tts .
docker run --rm -p 8080:8080 -v kokoro-hf:/data/huggingface -v kokoro-cache:/data/cache rfsn-kokoro-tts
```

### Native (requires espeak-ng)

```bash
cd services/kokoro-tts
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export HF_HOME=./.hf_cache CACHE_DIR=./.audio_cache
uvicorn app.main:app --reload --port 8080
```

## Tests

```bash
cd services/kokoro-tts
pip install -r requirements.txt
pytest -q
```

Unit tests mock Kokoro inference. They do not download the model.

### Integration verification (live service)

With the service running (Docker or Python 3.11):

```bash
python scripts/verify_service.py http://127.0.0.1:8080
```

Checks `/health`, `/synthesize` WAV output, and cache hit behavior.

## Railway deployment

Deploy from the **repository root** so Railway uses this directory as the service root (not the monorepo Node app):

```bash
railway service link kokoro-tts
railway up ./services/kokoro-tts --path-as-root --service kokoro-tts --detach
```

Required variables:

- `MODEL_NAME=hexgrad/Kokoro-82M`
- `HF_HOME=/data/huggingface`
- `CACHE_DIR=/data/cache`
- `TTS_SERVICE_TOKEN=<secret>` (required in production; protects `POST /synthesize`)

Attach a persistent volume at `/data`.

`GET /health` is unauthenticated. `POST /synthesize` requires `Authorization: Bearer <TTS_SERVICE_TOKEN>`.

Max request text length: **500 characters**. Client-facing errors are sanitized (`invalid request`, `synthesis failed`, `unauthorized`).

First boot downloads the model (may take several minutes). Verify:

```bash
curl https://<host>/health
curl -X POST https://<host>/synthesize \
  -H "Authorization: Bearer $TTS_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"voice":"sofia","text":"Tony Dorsey just reached for Josh Allen."}' \
  --output test.wav
```

## Architecture (future)

```
RFSN Backend (Node) → POST /synthesize → Kokoro Service (Python) → audio/wav
```

Phase 1 stops here. No Node integration, playback, or broadcast changes yet.
