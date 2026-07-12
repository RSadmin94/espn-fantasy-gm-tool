"""
RFSN analyst voice mapping — single configuration surface for Kokoro voice IDs.

Callers use logical names (sofia, coach, roxanne). Kokoro model IDs stay internal.
"""
from __future__ import annotations

from typing import Final

# American English voices from hexgrad/Kokoro-82M (see VOICES.md).
VOICE_MAP: Final[dict[str, str]] = {
    # Factual lead analyst — clear, high-quality female (grade A).
    "sofia": "af_heart",
    # Football lifer — steady male delivery (grade C+).
    "coach": "am_michael",
    # Needle / edge — distinct female from Sofia (grade A-).
    "roxanne": "af_bella",
}

SUPPORTED_VOICES: Final[frozenset[str]] = frozenset(VOICE_MAP.keys())


def resolve_kokoro_voice(logical_voice: str) -> str:
    key = logical_voice.strip().lower()
    if key not in VOICE_MAP:
        supported = ", ".join(sorted(SUPPORTED_VOICES))
        raise ValueError(f"Unsupported voice '{logical_voice}'. Supported: {supported}")
    return VOICE_MAP[key]
