"""
SynapseAI training script (train.py)

This is a minimal scaffold for training a neural network model.
Fill in the TODO sections with your own dataset and model code.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
from torch import nn
from torch.utils.data import DataLoader

import config
import dataset
import utils


def build_model() -> nn.Module:
    """Return a simple placeholder model."""
    input_dim = config.MODEL_INPUT_DIM
    hidden_dim = config.MODEL_HIDDEN_DIM
    output_dim = config.MODEL_OUTPUT_DIM

    return nn.Sequential(
        nn.Linear(input_dim, hidden_dim),
        nn.ReLU(),
        nn.Linear(hidden_dim, output_dim),
    )


def train_one_epoch(model: nn.Module, loader: DataLoader, criterion: nn.Module, optimizer: torch.optim.Optimizer) -> float:
    model.train()
    running_loss = 0.0
    for batch in loader:
        inputs, targets = batch
        inputs = inputs.to(config.DEVICE)
        targets = targets.to(config.DEVICE)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()

        running_loss += float(loss.item())
    return running_loss / max(1, len(loader))


def main() -> None:
    utils.ensure_reproducibility(config.SEED)

    train_ds = dataset.build_dataset(split="train")
    train_loader = DataLoader(train_ds, batch_size=config.BATCH_SIZE, shuffle=True)

    model = build_model().to(config.DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.LEARNING_RATE)
    criterion = nn.MSELoss()

    best_loss: float | None = None
    save_path = Path(config.CHECKPOINT_PATH)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, config.EPOCHS + 1):
        loss = train_one_epoch(model, train_loader, criterion, optimizer)
        utils.log_info(f"Epoch {epoch}/{config.EPOCHS} - loss={loss:.4f}")

        if best_loss is None or loss < best_loss:
            best_loss = loss
            utils.log_info(f"New best loss {best_loss:.4f}, saving checkpoint to {save_path}")
            torch.save({"model_state": model.state_dict(), "epoch": epoch, "loss": loss}, save_path)


if __name__ == "__main__":
    main()

