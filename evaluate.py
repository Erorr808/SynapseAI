"""
Model evaluation script (evaluate.py).

Computes simple metrics like MAE to assess model performance.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Tuple

import torch
from torch.utils.data import DataLoader

import config
import dataset
import inference
import utils


def mean_absolute_error(preds: torch.Tensor, targets: torch.Tensor) -> float:
    return torch.mean(torch.abs(preds - targets)).item()


def evaluate() -> Tuple[float]:
    ds = dataset.build_dataset(split="val")
    loader = DataLoader(ds, batch_size=config.BATCH_SIZE, shuffle=False)

    model = inference.load_model(config.CHECKPOINT_PATH)
    all_preds = []
    all_targets = []

    for batch in loader:
        inputs, targets = batch
        inputs = inputs.to(config.DEVICE)
        targets = targets.to(config.DEVICE)
        with torch.no_grad():
            outputs = model(inputs)
        all_preds.append(outputs)
        all_targets.append(targets)

    preds = torch.cat(all_preds, dim=0)
    targets = torch.cat(all_targets, dim=0)
    mae = mean_absolute_error(preds, targets)
    return mae,


def main() -> None:
    utils.log_info("Evaluating model...")
    mae, = evaluate()
    utils.log_info(f"Validation MAE: {mae:.4f}")


if __name__ == "__main__":
    main()

