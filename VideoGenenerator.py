"""
SynapseAI VideoGenenerator (Python, name kept as requested).

Produces a structured description of a video to generate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict
import uuid


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


@dataclass
class VideoRequest:
    prompt: str
    duration_seconds: float = 10.0
    resolution: str = "1920x1080"


def generate_video(request: VideoRequest) -> Dict[str, Any]:
    prompt = _norm(request.prompt)
    if not prompt:
        raise ValueError("VideoGenenerator.py: prompt is required.")

    duration = float(request.duration_seconds or 10.0)
    if duration <= 0:
        duration = 10.0
    resolution = _norm(request.resolution) or "1920x1080"

    return {
        "id": f"vid-py-{uuid.uuid4().hex[:10]}",
        "engine": "SynapseAI-Video-Python",
        "createdAt": _now_iso(),
        "prompt": prompt,
        "durationSeconds": duration,
        "resolution": resolution,
        "preview": f"[Video-Python] {duration:.1f}s at {resolution} prompt=\"{prompt}\"",
    }


__all__ = ["VideoRequest", "generate_video"]

