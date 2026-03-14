"""
Model inference entry point (inference.py).

Loads a saved checkpoint and runs predictions on new inputs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

import torch
from torch import nn

import config
import preprocess
import utils


def load_model(checkpoint_path: str | Path) -> nn.Module:
    from train import build_model  # local import to avoid circulars

    model = build_model().to(config.DEVICE)
    ckpt = torch.load(checkpoint_path, map_location=config.DEVICE)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model


def predict(model: nn.Module, texts: Iterable[str]) -> List[float]:
    tokens = preprocess.tokenize(texts)
    inputs, _ = preprocess.to_tensor(tokens)
    inputs = inputs.to(config.DEVICE)
    with torch.no_grad():
        outputs = model(inputs)
    return [float(x) for x in outputs.squeeze(-1).cpu().tolist()]


def main() -> None:
    utils.log_info("Running inference with SynapseAI model...")
    checkpoint = Path(config.CHECKPOINT_PATH)
    if not checkpoint.exists():
        raise SystemExit(f"Checkpoint not found: {checkpoint}")

    model = load_model(checkpoint)
    examples = ["Hello SynapseAI", "This is a longer line to score."]
    scores = predict(model, examples)
    for txt, score in zip(examples, scores, strict=False):
        print(f"{txt!r} -> {score:.3f}")


if __name__ == "__main__":
    main()

