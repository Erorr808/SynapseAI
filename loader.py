"""
Lightweight loader for SynapseAI mind runtime.
"""

from pathlib import Path
import json
from typing import Any, Dict, Optional

from .Mind import SynapseMind, MindConfig


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    path = Path(config_path or Path(__file__).with_name("config.sample.json"))
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def build_mind(config_path: Optional[str] = None) -> SynapseMind:
    cfg = load_config(config_path)
    mind_cfg = cfg.get("mind", {})
    return SynapseMind(
        mastermind_config=cfg,
        mind_config=MindConfig(
            request_timeout=int(mind_cfg.get("request_timeout", 45)),
            fallback_to_python=bool(mind_cfg.get("fallback_to_python", True)),
            auto_load_state=bool(mind_cfg.get("auto_load_state", True)),
        ),
        prefer_dual_mastermind=True,
    )


__all__ = ["load_config", "build_mind"]
