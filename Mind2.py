
"""
SynapseAI Mind 2.0 Runtime

This module provides an alternative implementation of the SynapseAI Mind.
It is designed to be a lightweight and streamlined version of the original Mind.py.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional


def _now_iso() -> str:
    """Returns the current time in ISO 8601 format with a 'Z' suffix."""
    return datetime.utcnow().isoformat() + "Z"


def _normalize_text(value: Any) -> str:
    """Converts a value to a stripped string, returning an empty string for None."""
    if value is None:
        return ""
    return str(value).strip()


class MindError(RuntimeError):
    """Base error for the Synapse mind runtime."""


class MastermindUnavailableError(MindError):
    """Raised when the Mastermind engine cannot be reached."""


class BridgeExecutionError(MindError):
    """Raised when there is an error executing a command through the bridge."""


@dataclass
class Mind2Config:
    """Configuration for SynapseMind2."""
    request_timeout: int = 60
    auto_load_state: bool = False
    model_name: str = "SynapseAI-v2"


class SynapseMind2:
    """
    A streamlined implementation of the SynapseAI Mind.
    """

    def __init__(
        self,
        config: Optional[Mind2Config] = None,
        state_path: Optional[str] = None,
    ) -> None:
        self.config = config or Mind2Config()
        self.session_id = f"mind2-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        self.cycle_count = 0
        self.last_error: Optional[str] = None

    def think(self, text: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Processes the input text and returns a response.
        """
        safe_text = _normalize_text(text)
        if not safe_text:
            raise MindError("Input text is required.")

        self.cycle_count += 1

        response_text = f"Received input: '{safe_text}'. This is a dummy response from Mind2."

        return {
            "id": f"mind2-cycle-{self.cycle_count}-{uuid.uuid4().hex[:8]}",
            "cycle": self.cycle_count,
            "sessionId": self.session_id,
            "receivedAt": _now_iso(),
            "completedAt": _now_iso(),
            "input": safe_text,
            "response": response_text,
            "status": self.get_status(),
        }

    def get_status(self) -> Dict[str, Any]:
        """
        Returns the current status of the mind.
        """
        return {
            "modelName": self.config.model_name,
            "mode": "python-standalone",
            "sessionId": self.session_id,
            "startedAt": self.started_at,
            "cycleCount": self.cycle_count,
        }

    def reset(self) -> Dict[str, Any]:
        """
        Resets the mind to its initial state.
        """
        self.cycle_count = 0
        self.session_id = f"mind2-{uuid.uuid4().hex[:12]}"
        self.started_at = _now_iso()
        return self.get_status()


def create_synapse_mind2(config: Optional[Mind2Config] = None) -> SynapseMind2:
    """Factory helper for building a SynapseMind2 instance."""
    return SynapseMind2(config=config)


if __name__ == "__main__":
    mind = create_synapse_mind2()
    print(f"SynapseMind2 started. Model: {mind.config.model_name}")
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
        print(f"SynapseAI> {result.get('response', '')}
")
