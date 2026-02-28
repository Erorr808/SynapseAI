"""
SynapseAI Mind2 Runtime

Mind2 is a higher-capability wrapper around SynapseMind that prefers
Mastermind3.js (triad consensus) by default while preserving compatibility
with the original Mind.py API.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from .Mind import MindConfig, SynapseMind


class SynapseMind2(SynapseMind):
    """Smart runtime that defaults to Mastermind3.js (triad mastermind)."""

    def __init__(
        self,
        mastermind_js_path: Optional[str] = None,
        bridge_script_path: Optional[str] = None,
        node_binary: Optional[str] = None,
        mastermind_config: Optional[Dict[str, Any]] = None,
        mind_config: Optional[MindConfig] = None,
        state_path: Optional[str] = None,
    ) -> None:
        base_dir = Path(__file__).resolve().parent
        resolved_path = mastermind_js_path or str(base_dir / "Mastermind3.js")

        super().__init__(
            mastermind_js_path=resolved_path,
            bridge_script_path=bridge_script_path,
            node_binary=node_binary,
            mastermind_config=mastermind_config,
            mind_config=mind_config,
            state_path=state_path,
            prefer_dual_mastermind=True,
            prefer_triple_mastermind=True,
        )


def create_synapse_mind2(
    mastermind_config: Optional[Dict[str, Any]] = None,
    mind_config: Optional[MindConfig] = None,
) -> SynapseMind2:
    """Factory helper for building a SynapseMind2 instance."""
    return SynapseMind2(
        mastermind_config=mastermind_config or {},
        mind_config=mind_config,
    )


__all__ = ["SynapseMind2", "create_synapse_mind2", "MindConfig"]
