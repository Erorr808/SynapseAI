"""
Dataset utilities for SynapseAI (dataset.py).

Defines a simple torch Dataset based on token lengths.
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import torch
from torch.utils.data import Dataset

import preprocess


class LengthDataset(Dataset):
    def __init__(self, split: str = "train") -> None:
        self.split = split
        sample_path = Path("data") / f"{split}.txt"
        if sample_path.exists():
            lines = preprocess.load_raw_lines(sample_path)
        else:
            lines = ["Sample line one", "Another example input"]
        self.tokens = preprocess.tokenize(lines)
        self.inputs, self.targets = preprocess.to_tensor(self.tokens)

    def __len__(self) -> int:
        return self.inputs.shape[0]

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.inputs[idx], self.targets[idx]


def build_dataset(split: str = "train") -> LengthDataset:
    return LengthDataset(split=split)


__all__ = ["LengthDataset", "build_dataset"]

