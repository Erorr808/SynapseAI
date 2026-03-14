'use strict';

// Secondary JS video generator that collaborates with VideoGenenerator.js.

const coreVideo = require('./VideoGenenerator.js');

async function generateVideo(request) {
  const base = await coreVideo.generateVideo(request);
  return {
    ...base,
    engine: 'SynapseAI-Video-Orchestrator-2',
    collaborator: base.engine
  };
}

module.exports = {
  generateVideo
};

