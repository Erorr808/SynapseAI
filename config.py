"""
Central configuration for SynapseAI training/inference (config.py).
"""

from __future__ import annotations

import torch

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

SEED = 42

# Training hyperparameters
LEARNING_RATE = 1e-3
BATCH_SIZE = 32
EPOCHS = 5

# Model dimensions (for the simple example model in train.py)
MODEL_INPUT_DIM = 1
MODEL_HIDDEN_DIM = 32
MODEL_OUTPUT_DIM = 1

# Paths
CHECKPOINT_PATH = "checkpoints/synapse_model.pt"

