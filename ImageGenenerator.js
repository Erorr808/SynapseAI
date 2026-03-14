'use strict';

// NOTE: name kept as requested (ImageGenenerator.js, with typo).
// This file simply delegates to the core ImageGenerator.js module.

const core = require('./ImageGenerator.js');

async function generateImage(request) {
  return core.generateImage(request);
}

module.exports = { generateImage };

