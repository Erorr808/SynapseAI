"""
SynapseAI Mind 3.0 Runtime

A triad-style Python mind that can coordinate:
- planning
- building
- reviewing

This mirrors the idea of Mastermind3.js but stays lightweight.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


@dataclass
class Mind3Config:
    model_name: str = "SynapseAI-Mind3"


class SynapseMind3:
    """
    Minimal triad-style Python mind.
    """

    def __init__(self, config: Optional[Mind3Config] = None) -> None:
        self.config = config or Mind3Config()
        self.session_id = f"mind3-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        self.cycle_count = 0

    def think(self, text: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        safe_text = _normalize_text(text)
        if not safe_text:
            raise RuntimeError("Input text is required.")

        self.cycle_count += 1

        plan = f"[Planner] Outline steps for: {safe_text}"
        build = f"[Builder] Draft solution for: {safe_text}"
        review = "[Reviewer] Highlight risks and improvements."

        response = "\n".join([plan, build, review])

        return {
            "id": f"mind3-cycle-{self.cycle_count}-{uuid.uuid4().hex[:8]}",
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
            "modelName": self.config.model_name,
            "mode": "python-triad",
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "cycleCount": self.cycle_count,
        }

    def reset(self) -> Dict[str, Any]:
        self.cycle_count = 0
        self.session_id = f"mind3-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        return self.get_status()


def create_synapse_mind3(config: Optional[Mind3Config] = None) -> SynapseMind3:
    return SynapseMind3(config=config)


if __name__ == "__main__":
    mind = create_synapse_mind3()
    print(f"SynapseMind3 started. Model: {mind.config.model_name}")
    print("Commands: /status, /reset, /exit")
    while True:
        try:
            text = input("You> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            continue
        if text == "/exit":
            break
        if text == "/status":
            print(json.dumps(mind.get_status(), indent=2))
            continue
        if text == "/reset":
            print(json.dumps(mind.reset(), indent=2))
            continue
        result = mind.think(text)
        print(f"SynapseAI> {result.get('response', '')}\n")

