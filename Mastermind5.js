'use strict';

/**
 * Mastermind5: thin wrapper that runs two Mastermind engines and
 * picks the higher-confidence response.
 *
 * This mirrors the spirit of Mastermind2.js but stays simple.
 */

const path = require('path');

const baseModule = require(path.join(__dirname, 'Mastermind.js'));

function resolveFactory(mod) {
  if (mod && typeof mod.createSynapseMastermind === 'function') return mod.createSynapseMastermind;
  if (mod && typeof mod.createMastermind === 'function') return mod.createMastermind;
  if (mod && typeof mod.SynapseMastermind === 'function') {
    return (config) => new mod.SynapseMastermind(config || {});
  }
  throw new Error('Cannot resolve Mastermind factory from Mastermind.js');
}

const createBase = resolveFactory(baseModule);

class SynapseMastermind5 {
  constructor(config = {}) {
    this.config = config || {};
    this.primary = createBase({ modelName: 'SynapseAI-5A' });
    this.secondary = createBase({ modelName: 'SynapseAI-5B' });
    this.sessionId = `synapse-5-${Date.now().toString(16)}`;
    this.cycleCount = 0;
  }

  async think(input, options = {}) {
    const text = String(input || '').trim();
    if (!text) {
      throw new Error('Input is required for Mastermind5.think().');
    }

    const baseOptions = { ...(options || {}), persist: false };
    const [a, b] = await Promise.all([
      this.primary.think(text, baseOptions),
      this.secondary.think(text, baseOptions)
    ]);

    this.cycleCount += 1;

    const qa = a && a.analysis && a.analysis.quality && typeof a.analysis.quality.score === 'number'
      ? a.analysis.quality.score
      : 0.5;
    const qb = b && b.analysis && b.analysis.quality && typeof b.analysis.quality.score === 'number'
      ? b.analysis.quality.score
      : 0.5;

    const winner = qa >= qb ? 'primary' : 'secondary';
    const chosen = winner === 'primary' ? a : b;

    return {
      id: `mm5-cycle-${this.cycleCount.toString(16)}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      input: text,
      winner,
      primary: a,
      secondary: b,
      response: chosen && chosen.response ? chosen.response : '',
      status: this.getStatus()
    };
  }

  async runCycle(input, source = 'user') {
    return this.think(input, { source });
  }

  getStatus() {
    return {
      modelName: 'SynapseAI-Mastermind5',
      mode: 'dual-select',
      sessionId: this.sessionId,
      cycleCount: this.cycleCount
    };
  }
}

function createSynapseMastermind(config = {}) {
  return new SynapseMastermind5(config);
}

function createMastermind(config = {}) {
  return new SynapseMastermind5(config);
}

const exported = {
  SynapseMastermind5,
  SynapseMastermind: SynapseMastermind5,
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
  globalThis.SynapseAI.Mastermind5 = SynapseMastermind5;
  globalThis.SynapseAI.createMastermind5 = createSynapseMastermind;
}

