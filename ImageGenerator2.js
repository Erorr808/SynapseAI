'use strict';

/**
 * Secondary JS image generator that collaborates with ImageGenerator.js.
 * It just forwards the request and adds a small note.
 */

const core = require('./ImageGenerator.js');

async function generateImage(request) {
  const base = await core.generateImage(request);
  return {
    ...base,
    engine: 'SynapseAI-Image-Orchestrator-2',
    collaborator: base.engine
  };
}

module.exports = {
  generateImage
};

