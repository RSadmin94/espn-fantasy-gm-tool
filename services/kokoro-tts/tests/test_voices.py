from __future__ import annotations

import pytest

from app.voices import VOICE_MAP, resolve_kokoro_voice


def test_voice_mapping_known_logical_names():
    assert resolve_kokoro_voice("sofia") == VOICE_MAP["sofia"]
    assert resolve_kokoro_voice("coach") == VOICE_MAP["coach"]
    assert resolve_kokoro_voice("roxanne") == VOICE_MAP["roxanne"]


def test_voice_mapping_is_case_insensitive():
    assert resolve_kokoro_voice("Sofia") == VOICE_MAP["sofia"]


def test_voice_mapping_rejects_unknown_voice():
    with pytest.raises(ValueError, match="Unsupported voice"):
        resolve_kokoro_voice("unknown")
