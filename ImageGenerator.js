'use strict';

/**
 * Core ImageGenerator orchestrator for SynapseAI (JS).
 *
 * All other image generator files in this folder delegate to this module.
 * It does NOT call a real image API yet; instead it returns a structured
 * description that you can plug into an actual backend if you want.
 */

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

async function generateImage(request) {
  const prompt = normalizeText(request && request.prompt);
  const size = normalizeText(request && request.size) || '1024x1024';
  const style = normalizeText(request && request.style) || 'vivid';

  if (!prompt) {
    throw new Error('ImageGenerator: prompt is required.');
  }

  return {
    id: `img-${Date.now().toString(16)}`,
    engine: 'SynapseAI-Image-Orchestrator',
    createdAt: nowIso(),
    prompt,
    size,
    style,
    // This is where a real URL or base64 image would go.
    preview: `[Image description] style=${style}, size=${size}, prompt="${prompt}"`
  };
}

module.exports = {
  generateImage
};

