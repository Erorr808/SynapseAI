"""
HTTP API for SynapseAI model (api.py).

Exposes a minimal FastAPI app for inference.
"""

from __future__ import annotations

from typing import List

from fastapi import FastAPI
from pydantic import BaseModel

import inference


class PredictRequest(BaseModel):
  texts: List[str]


class PredictResponse(BaseModel):
  scores: List[float]


app = FastAPI(title="SynapseAI API")

_model = None


def _get_model():
  global _model
  if _model is None:
    _model = inference.load_model("checkpoints/synapse_model.pt")
  return _model


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
  model = _get_model()
  scores = inference.predict(model, req.texts)
  return PredictResponse(scores=scores)


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="0.0.0.0", port=8000)

