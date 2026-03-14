"""
SynapseAI Mind 4.0 Runtime

Ultra-lightweight Python mind that just echoes input with metadata.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


class SynapseMind4:
    def __init__(self, model_name: str = "SynapseAI-Mind4") -> None:
        self.model_name = model_name
        self.session_id = f"mind4-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        self.cycle_count = 0

    def think(self, text: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        safe_text = _normalize_text(text)
        if not safe_text:
            raise RuntimeError("Input text is required.")

        self.cycle_count += 1
        response = f"[Mind4] Echo: {safe_text}"

        return {
            "id": f"mind4-cycle-{self.cycle_count}-{uuid.uuid4().hex[:8]}",
            "cycle": self.cycle_count,
            "sessionId": self.session_id,
            "receivedAt": _now_iso(),
            "completedAt": _now_iso(),
            "input": safe_text,
            "response": response,
            "status": self.get_status(),
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "modelName": self.model_name,
            "mode": "python-ultralight",
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "cycleCount": self.cycle_count,
        }

    def reset(self) -> Dict[str, Any]:
        self.cycle_count = 0
        self.session_id = f"mind4-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        return self.get_status()


def create_synapse_mind4(model_name: str = "SynapseAI-Mind4") -> SynapseMind4:
    return SynapseMind4(model_name=model_name)

