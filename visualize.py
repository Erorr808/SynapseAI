"""
Visualization helpers for SynapseAI (visualize.py).

Provides simple functions to plot training losses or distributions.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

import matplotlib.pyplot as plt


def plot_losses(losses: Iterable[float], out_path: str | Path = "plots/loss.png") -> None:
    values: List[float] = list(losses)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(range(1, len(values) + 1), values, marker="o")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Loss")
    ax.set_title("Training Loss")
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


__all__ = ["plot_losses"]

