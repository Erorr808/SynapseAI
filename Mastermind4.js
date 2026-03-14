
'use strict';

const path = require('path');

const DEFAULT_CONFIG = Object.freeze({
  modelName: 'SynapseAI-Quartet',
  modelVersion: '4.0.0-quartet',
  autoPersist: true,
});

const nowIso = () => new Date().toISOString();

const normalizeText = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}

class SynapseMastermind4 {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
    };

    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI-Quartet';
    this.modelVersion = normalizeText(this.config.modelVersion) || '4.0.0-quartet';
    this.sessionId = `synapse-quartet-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
    this.lastResult = null;
  }

  async think(input, options = {}) {
    const safeInput = normalizeText(input);
    if (!safeInput) {
      throw new Error('Input is required for think().');
    }

    this.cycleCount += 1;

    const responseText = `Received input: '${safeInput}'. This is a dummy response from Mastermind4.`;

    const result = {
      id: `quartet-cycle-${this.cycleCount}-${Math.random().toString(16).slice(2, 10)}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      receivedAt: nowIso(),
      completedAt: nowIso(),
      input: safeInput,
      response: responseText,
      status: this.getStatus(),
    };

    this.lastResult = result;
    return result;
  }

  getStatus() {
    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      mode: 'quartet-mastermind',
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
    };
  }

  async reset(options = {}) {
    this.cycleCount = 0;
    this.lastResult = null;
    return this.getStatus();
  }
}

function createSynapseMastermind(config = {}) {
  return new SynapseMastermind4(config);
}

function createMastermind(config = {}) {
  return new SynapseMastermind4(config);
}

const exported = {
  SynapseMastermind4,
  SynapseMastermind: SynapseMastermind4,
  createSynapseMastermind,
  createMastermind,
  DEFAULT_CONFIG
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}
