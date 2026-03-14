"""
SynapseAI ImageGenerator (Python)

Python-side image description generator that uses the same conceptual
protocol as ImageGenerator.js. It returns a structured dict that can be
plugged into a real image backend later.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional
import uuid


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


@dataclass
class ImageRequest:
    prompt: str
    size: str = "1024x1024"
    style: str = "vivid"


def generate_image(request: ImageRequest) -> Dict[str, Any]:
    prompt = _norm(request.prompt)
    if not prompt:
        raise ValueError("ImageGenerator.py: prompt is required.")

    size = _norm(request.size) or "1024x1024"
    style = _norm(request.style) or "vivid"

    return {
        "id": f"img-py-{uuid.uuid4().hex[:10]}",
        "engine": "SynapseAI-Image-Python",
        "createdAt": _now_iso(),
        "prompt": prompt,
        "size": size,
        "style": style,
        "preview": f"[Image-Python] style={style} size={size} prompt=\"{prompt}\"",
    }


__all__ = ["ImageRequest", "generate_image"]

