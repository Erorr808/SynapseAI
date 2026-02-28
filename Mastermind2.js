'use strict';

const path = require('path');

const mastermindModule = require(path.join(__dirname, 'Mastermind.js'));

function resolveBaseFactory(mod) {
  if (mod && typeof mod.createSynapseMastermind === 'function') {
    return mod.createSynapseMastermind;
  }
  if (mod && typeof mod.createMastermind === 'function') {
    return mod.createMastermind;
  }
  if (mod && typeof mod.SynapseMastermind === 'function') {
    return (config) => new mod.SynapseMastermind(config || {});
  }
  throw new Error('Unable to resolve base mastermind factory from Mastermind.js');
}

const createBaseMastermind = resolveBaseFactory(mastermindModule);

const DEFAULT_CONFIG = Object.freeze({
  modelName: 'SynapseAI-Dual',
  modelVersion: '2.0.0-dual',
  consensusMode: 'blend',
  autoPersist: true,
  enableBlendedResponse: true,
  primaryConfig: {
    modelName: 'SynapseAI-Primary',
    stateKey: 'synapse_ai_mastermind_primary_state',
    defaultTemperature: 0.18
  },
  secondaryConfig: {
    modelName: 'SynapseAI-Secondary',
    stateKey: 'synapse_ai_mastermind_secondary_state',
    defaultTemperature: 0.45
  },
  primaryModel: {
    temperature: 0.18
  },
  secondaryModel: {
    temperature: 0.45
  }
});

const nowIso = () => new Date().toISOString();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toText = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '[unserializable]';
  }
};

const normalizeText = (value) => toText(value).replace(/\s+/g, ' ').trim();

const safeClone = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
};

const hashText = (text) => {
  const input = normalizeText(text);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16);
};

class SynapseMastermind2 {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      primaryConfig: {
        ...DEFAULT_CONFIG.primaryConfig,
        ...((config && config.primaryConfig) || {})
      },
      secondaryConfig: {
        ...DEFAULT_CONFIG.secondaryConfig,
        ...((config && config.secondaryConfig) || {})
      },
      primaryModel: {
        ...DEFAULT_CONFIG.primaryModel,
        ...((config && config.primaryModel) || {})
      },
      secondaryModel: {
        ...DEFAULT_CONFIG.secondaryModel,
        ...((config && config.secondaryModel) || {})
      }
    };

    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI-Dual';
    this.modelVersion = normalizeText(this.config.modelVersion) || '2.0.0-dual';
    this.sessionId = `synapse-dual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
    this.lastResult = null;

    this.primary = createBaseMastermind(this.config.primaryConfig);
    this.secondary = createBaseMastermind(this.config.secondaryConfig);
  }

  _scoreCycle(result) {
    if (!result || typeof result !== 'object') {
      return 0.35;
    }

    const analysis = (result.analysis && typeof result.analysis === 'object')
      ? result.analysis
      : {};
    const qualityObj = (analysis.quality && typeof analysis.quality === 'object')
      ? analysis.quality
      : {};

    const qualityScore = Number(qualityObj.score);
    const uncertaintyScore = Number(
      analysis.uncertainty !== undefined
        ? analysis.uncertainty
        : (result.plan && result.plan.uncertainty !== undefined ? result.plan.uncertainty : 0.5)
    );
    const contextStrengthScore = Number(
      analysis.contextStrength !== undefined ? analysis.contextStrength : 0.5
    );

    const quality = Number.isFinite(qualityScore) ? clamp(qualityScore, 0, 1) : 0.55;
    const uncertainty = Number.isFinite(uncertaintyScore) ? clamp(uncertaintyScore, 0, 1) : 0.5;
    const contextStrength = Number.isFinite(contextStrengthScore)
      ? clamp(contextStrengthScore, 0, 1)
      : 0.5;

    return clamp(
      quality * 0.7 + (1 - uncertainty) * 0.2 + contextStrength * 0.1,
      0,
      1
    );
  }

  _blendResponses(primaryText, secondaryText, winner) {
    const first = normalizeText(primaryText);
    const second = normalizeText(secondaryText);

    if (!this.config.enableBlendedResponse) {
      return winner === 'primary' ? first : second;
    }

    if (!first && !second) {
      return '';
    }
    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }

    if (winner === 'primary') {
      return `${first}\n\nSecond perspective:\n${second}`;
    }
    return `${second}\n\nSecond perspective:\n${first}`;
  }

  _mergeGoals(primaryGoals, secondaryGoals) {
    const merged = [];
    const seen = new Set();

    const append = (items) => {
      for (const goal of items || []) {
        if (!goal || typeof goal !== 'object') {
          continue;
        }
        const key = normalizeText(goal.id) || normalizeText(goal.title);
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        merged.push(goal);
      }
    };

    append(primaryGoals);
    append(secondaryGoals);

    merged.sort((a, b) => {
      const aPriority = Number(a.priority) || 0;
      const bPriority = Number(b.priority) || 0;
      return bPriority - aPriority;
    });

    return merged;
  }

  _buildConsensus(primaryResult, secondaryResult, inputText) {
    const primaryScore = this._scoreCycle(primaryResult);
    const secondaryScore = this._scoreCycle(secondaryResult);
    const winner = primaryScore >= secondaryScore ? 'primary' : 'secondary';
    const disagreement = Math.abs(primaryScore - secondaryScore);
    const confidence = clamp(
      ((primaryScore + secondaryScore) / 2) - (disagreement * 0.18),
      0,
      1
    );

    const primaryResponse = normalizeText(primaryResult && primaryResult.response);
    const secondaryResponse = normalizeText(secondaryResult && secondaryResult.response);

    const response = this.config.consensusMode === 'winner_take_all'
      ? (winner === 'primary' ? primaryResponse : secondaryResponse)
      : this._blendResponses(primaryResponse, secondaryResponse, winner);

    return {
      winner,
      confidence,
      disagreement,
      scores: {
        primary: primaryScore,
        secondary: secondaryScore
      },
      response,
      inputHash: hashText(inputText).slice(0, 12)
    };
  }

  _buildThinkResult(inputText, primaryResult, secondaryResult, consensus) {
    const primaryPlan = (primaryResult && primaryResult.plan) || {};
    const secondaryPlan = (secondaryResult && secondaryResult.plan) || {};
    const primaryAnalysis = (primaryResult && primaryResult.analysis) || {};
    const secondaryAnalysis = (secondaryResult && secondaryResult.analysis) || {};

    const uncertainty = clamp(
      (
        Number(primaryAnalysis.uncertainty ?? primaryPlan.uncertainty ?? 0.5) +
        Number(secondaryAnalysis.uncertainty ?? secondaryPlan.uncertainty ?? 0.5)
      ) / 2,
      0,
      1
    );

    const contextStrength = clamp(
      (
        Number(primaryAnalysis.contextStrength ?? 0.5) +
        Number(secondaryAnalysis.contextStrength ?? 0.5)
      ) / 2,
      0,
      1
    );

    const alternatives = [];
    if (primaryPlan.strategy) {
      alternatives.push({
        source: 'primary',
        strategy: safeClone(primaryPlan.strategy)
      });
    }
    if (secondaryPlan.strategy) {
      alternatives.push({
        source: 'secondary',
        strategy: safeClone(secondaryPlan.strategy)
      });
    }

    return {
      id: `dual-cycle-${this.cycleCount}-${consensus.inputHash}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      receivedAt: nowIso(),
      completedAt: nowIso(),
      input: inputText,
      intent: safeClone(primaryResult && primaryResult.intent) || safeClone(secondaryResult && secondaryResult.intent) || {},
      safety: safeClone(primaryResult && primaryResult.safety) || safeClone(secondaryResult && secondaryResult.safety) || { blocked: false, risk: 0, reasons: [] },
      plan: {
        mode: normalizeText(primaryPlan.mode) || normalizeText(secondaryPlan.mode) || 'general',
        strategy: {
          name: 'Dual Consensus',
          style: 'dual',
          score: consensus.confidence
        },
        alternatives,
        uncertainty,
        contextStrength,
        primaryPlan: safeClone(primaryPlan),
        secondaryPlan: safeClone(secondaryPlan)
      },
      response: consensus.response,
      responseMeta: {
        source: 'dual-consensus',
        winner: consensus.winner,
        consensus: safeClone(consensus)
      },
      analysis: {
        quality: {
          score: consensus.confidence,
          needsRevision: false
        },
        uncertainty,
        contextStrength,
        strategy: {
          name: 'Dual Consensus',
          style: 'dual',
          score: consensus.confidence
        },
        consensus: safeClone(consensus),
        primary: safeClone(primaryAnalysis),
        secondary: safeClone(secondaryAnalysis)
      },
      twins: {
        primary: safeClone(primaryResult),
        secondary: safeClone(secondaryResult)
      },
      status: this.getStatus()
    };
  }

  async think(input, options = {}) {
    const safeInput = normalizeText(input);
    if (!safeInput) {
      throw new Error('Input is required for think().');
    }

    const baseOptions = {
      ...(options || {}),
      persist: false
    };

    const primaryOptions = {
      ...baseOptions,
      model: {
        ...((baseOptions && baseOptions.model) || {}),
        ...this.config.primaryModel
      }
    };

    const secondaryOptions = {
      ...baseOptions,
      model: {
        ...((baseOptions && baseOptions.model) || {}),
        ...this.config.secondaryModel
      }
    };

    const [primaryResult, secondaryResult] = await Promise.all([
      this.primary.think(safeInput, primaryOptions),
      this.secondary.think(safeInput, secondaryOptions)
    ]);

    this.cycleCount += 1;
    const consensus = this._buildConsensus(primaryResult, secondaryResult, safeInput);
    const result = this._buildThinkResult(safeInput, primaryResult, secondaryResult, consensus);

    this.lastResult = safeClone(result);
    result.status = this.getStatus();
    this.lastResult.status = safeClone(result.status);
    return result;
  }

  async runCycle(input, source = 'user') {
    return this.think(input, { source });
  }

  setResponder(handler) {
    if (typeof this.primary.setResponder === 'function') {
      this.primary.setResponder(handler);
    }
    if (typeof this.secondary.setResponder === 'function') {
      this.secondary.setResponder(handler);
    }
    return this;
  }

  registerTool(name, handler, options) {
    const primaryTool = typeof this.primary.registerTool === 'function'
      ? this.primary.registerTool(name, handler, options)
      : null;
    const secondaryTool = typeof this.secondary.registerTool === 'function'
      ? this.secondary.registerTool(name, handler, options)
      : null;
    return {
      primary: safeClone(primaryTool),
      secondary: safeClone(secondaryTool)
    };
  }

  unregisterTool(name) {
    const primaryRemoved = typeof this.primary.unregisterTool === 'function'
      ? this.primary.unregisterTool(name)
      : false;
    const secondaryRemoved = typeof this.secondary.unregisterTool === 'function'
      ? this.secondary.unregisterTool(name)
      : false;
    return primaryRemoved || secondaryRemoved;
  }

  listTools() {
    const primaryTools = typeof this.primary.listTools === 'function'
      ? this.primary.listTools()
      : [];
    const secondaryTools = typeof this.secondary.listTools === 'function'
      ? this.secondary.listTools()
      : [];

    const merged = [];
    const seen = new Set();
    for (const tool of [...primaryTools, ...secondaryTools]) {
      const key = normalizeText(tool && tool.name);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(tool);
    }
    return merged;
  }

  remember(kind, content, options = {}) {
    const primaryMemory = typeof this.primary.remember === 'function'
      ? this.primary.remember(kind, content, options)
      : null;
    const secondaryMemory = typeof this.secondary.remember === 'function'
      ? this.secondary.remember(kind, content, options)
      : null;
    return {
      primary: safeClone(primaryMemory),
      secondary: safeClone(secondaryMemory)
    };
  }

  addGoal(goal) {
    const primaryGoal = typeof this.primary.addGoal === 'function'
      ? this.primary.addGoal(goal)
      : null;
    const secondaryGoal = typeof this.secondary.addGoal === 'function'
      ? this.secondary.addGoal(goal)
      : null;
    return {
      primary: safeClone(primaryGoal),
      secondary: safeClone(secondaryGoal)
    };
  }

  listGoals(filters = {}) {
    const primaryGoals = typeof this.primary.listGoals === 'function'
      ? this.primary.listGoals(filters)
      : [];
    const secondaryGoals = typeof this.secondary.listGoals === 'function'
      ? this.secondary.listGoals(filters)
      : [];
    return this._mergeGoals(primaryGoals, secondaryGoals);
  }

  addKnowledge(key, value, confidence, metadata) {
    const primaryItem = typeof this.primary.addKnowledge === 'function'
      ? this.primary.addKnowledge(key, value, confidence, metadata)
      : null;
    const secondaryItem = typeof this.secondary.addKnowledge === 'function'
      ? this.secondary.addKnowledge(key, value, confidence, metadata)
      : null;
    return {
      primary: safeClone(primaryItem),
      secondary: safeClone(secondaryItem)
    };
  }

  queryKnowledge(query, limit) {
    const primaryItems = typeof this.primary.queryKnowledge === 'function'
      ? this.primary.queryKnowledge(query, limit)
      : [];
    const secondaryItems = typeof this.secondary.queryKnowledge === 'function'
      ? this.secondary.queryKnowledge(query, limit)
      : [];

    const merged = [];
    const seen = new Set();
    for (const item of [...primaryItems, ...secondaryItems]) {
      const key = normalizeText(item && item.key) || hashText(toText(item));
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
    return merged.slice(0, Number(limit) > 0 ? Number(limit) : 8);
  }

  registerFeedback(feedback) {
    const primaryFeedback = typeof this.primary.registerFeedback === 'function'
      ? this.primary.registerFeedback(feedback)
      : null;
    const secondaryFeedback = typeof this.secondary.registerFeedback === 'function'
      ? this.secondary.registerFeedback(feedback)
      : null;

    const primaryScore = Number(primaryFeedback && primaryFeedback.globalScore);
    const secondaryScore = Number(secondaryFeedback && secondaryFeedback.globalScore);
    const avgScore = clamp(
      (
        (Number.isFinite(primaryScore) ? primaryScore : 0.5) +
        (Number.isFinite(secondaryScore) ? secondaryScore : 0.5)
      ) / 2,
      0,
      1
    );

    return {
      primary: safeClone(primaryFeedback),
      secondary: safeClone(secondaryFeedback),
      globalScore: avgScore
    };
  }

  getStatus() {
    const primaryStatus = typeof this.primary.getStatus === 'function'
      ? this.primary.getStatus()
      : {};
    const secondaryStatus = typeof this.secondary.getStatus === 'function'
      ? this.secondary.getStatus()
      : {};

    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      mode: 'dual-mastermind',
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      consensusMode: this.config.consensusMode,
      lastWinner: this.lastResult && this.lastResult.responseMeta
        ? this.lastResult.responseMeta.winner
        : null,
      primary: safeClone(primaryStatus),
      secondary: safeClone(secondaryStatus)
    };
  }

  exportState() {
    const primaryState = typeof this.primary.exportState === 'function'
      ? this.primary.exportState()
      : {};
    const secondaryState = typeof this.secondary.exportState === 'function'
      ? this.secondary.exportState()
      : {};

    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      lastResult: safeClone(this.lastResult),
      config: safeClone(this.config),
      primary: safeClone(primaryState),
      secondary: safeClone(secondaryState),
      exportedAt: nowIso()
    };
  }

  importState(state = {}) {
    const snapshot = state && typeof state === 'object' ? state : {};

    if (snapshot.sessionId) {
      this.sessionId = normalizeText(snapshot.sessionId) || this.sessionId;
    }
    if (snapshot.startedAt) {
      this.startedAt = normalizeText(snapshot.startedAt) || this.startedAt;
    }
    if (snapshot.cycleCount !== undefined) {
      this.cycleCount = Math.max(0, Number(snapshot.cycleCount) || 0);
    }
    if (snapshot.lastResult !== undefined) {
      this.lastResult = safeClone(snapshot.lastResult);
    }

    if (snapshot.primary && typeof this.primary.importState === 'function') {
      this.primary.importState(snapshot.primary);
    }
    if (snapshot.secondary && typeof this.secondary.importState === 'function') {
      this.secondary.importState(snapshot.secondary);
    }

    return this.getStatus();
  }

  async reset(options = {}) {
    if (typeof this.primary.reset === 'function') {
      await this.primary.reset(options);
    }
    if (typeof this.secondary.reset === 'function') {
      await this.secondary.reset(options);
    }

    this.cycleCount = 0;
    this.lastResult = null;
    return this.getStatus();
  }
}

function createSynapseMastermind(config = {}) {
  return new SynapseMastermind2(config);
}

function createMastermind(config = {}) {
  return new SynapseMastermind2(config);
}

const exported = {
  SynapseMastermind2,
  SynapseMastermind: SynapseMastermind2,
  createSynapseMastermind,
  createMastermind,
  DEFAULT_CONFIG
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof define === 'function' && define.amd) {
  define(() => exported);
}

if (typeof globalThis !== 'undefined') {
  globalThis.SynapseAI = globalThis.SynapseAI || {};
  globalThis.SynapseAI.Mastermind2 = SynapseMastermind2;
  globalThis.SynapseAI.createMastermind2 = createSynapseMastermind;
}
