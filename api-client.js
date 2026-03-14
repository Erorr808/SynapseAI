'use strict';

/**
 * Simple API client that can call the Python FastAPI backend (api.py).
 */

export async function callSynapseApi(texts) {
  const body = { texts };
  const res = await fetch('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error('API HTTP error ' + res.status);
  }
  return res.json();
}

