"""
Data preprocessing utilities for SynapseAI (preprocess.py).

This file turns raw data into tensors ready for training or inference.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, List, Tuple

import torch

import utils


def load_raw_lines(path: str | Path) -> List[str]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    return [line.rstrip("\n") for line in p.read_text(encoding="utf-8").splitlines()]


def tokenize(lines: Iterable[str]) -> List[List[str]]:
    return [utils.simple_tokenize(line) for line in lines]


def to_tensor(batch_tokens: List[List[str]]) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Very simple example: convert token counts into a single scalar length value.
    Returns (inputs, targets) tensors.
    """
    lengths = [len(tokens) for tokens in batch_tokens]
    inputs = torch.tensor([[float(l)] for l in lengths], dtype=torch.float32)
    targets = torch.tensor([[float(l)] for l in lengths], dtype=torch.float32)
    return inputs, targets


__all__ = ["load_raw_lines", "tokenize", "to_tensor"]

