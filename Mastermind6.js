'use strict';

/**
 * Mastermind6: ultra-light JS mastermind that just echoes.
 * Useful for quick testing and as a template.
 */

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

class SynapseMastermind6 {
  constructor(config = {}) {
    this.config = config || {};
    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI-Mastermind6';
    this.modelVersion = normalizeText(this.config.modelVersion) || '6.0.0';
    this.sessionId = `synapse-6-${Date.now().toString(16)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
  }

  async think(input, options = {}) {
    const text = normalizeText(input);
    if (!text) {
      throw new Error('Input is required for Mastermind6.think().');
    }
    this.cycleCount += 1;
    const response = `[Mastermind6] Echo: ${text}`;
    return {
      id: `mm6-cycle-${this.cycleCount.toString(16)}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      receivedAt: nowIso(),
      completedAt: nowIso(),
      input: text,
      response,
      status: this.getStatus()
    };
  }

  async runCycle(input, source = 'user') {
    return this.think(input, { source });
  }

  getStatus() {
    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      mode: 'ultralight-js',
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount
    };
  }
}

function createSynapseMastermind(config = {}) {
  return new SynapseMastermind6(config);
}

function createMastermind(config = {}) {
  return new SynapseMastermind6(config);
}

const exported = {
  SynapseMastermind6,
  SynapseMastermind: SynapseMastermind6,
  createSynapseMastermind,
  createMastermind
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof define === 'function' && define.amd) {
  define(() => exported);
}

if (typeof globalThis !== 'undefined') {
  globalThis.SynapseAI = globalThis.SynapseAI || {};
  globalThis.SynapseAI.Mastermind6 = SynapseMastermind6;
  globalThis.SynapseAI.createMastermind6 = createSynapseMastermind;
}

