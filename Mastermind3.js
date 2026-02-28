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
  modelName: 'SynapseAI-Triad',
  modelVersion: '3.0.0-triad',
  consensusMode: 'blend',
  autoPersist: true,
  enableBlendedResponse: true,
  primaryConfig: {
    modelName: 'SynapseAI-Primary',
    stateKey: 'synapse_ai_mastermind_primary_state',
    defaultTemperature: 0.12
  },
  secondaryConfig: {
    modelName: 'SynapseAI-Secondary',
    stateKey: 'synapse_ai_mastermind_secondary_state',
    defaultTemperature: 0.35
  },
  challengerConfig: {
    modelName: 'SynapseAI-Challenger',
    stateKey: 'synapse_ai_mastermind_challenger_state',
    defaultTemperature: 0.52
  },
  primaryModel: { temperature: 0.12 },
  secondaryModel: { temperature: 0.35 },
  challengerModel: { temperature: 0.52 }
});

const nowIso = () => new Date().toISOString();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '[unserializable]';
  }
};

const normalizeText = (value) => toText(value).replace(/\s+/g, ' ').trim();

const safeClone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
};

const hashText = (text) => {
  const input = normalizeText(text);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
};

class SynapseMastermind3 {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      primaryConfig: { ...DEFAULT_CONFIG.primaryConfig, ...((config && config.primaryConfig) || {}) },
      secondaryConfig: { ...DEFAULT_CONFIG.secondaryConfig, ...((config && config.secondaryConfig) || {}) },
      challengerConfig: { ...DEFAULT_CONFIG.challengerConfig, ...((config && config.challengerConfig) || {}) },
      primaryModel: { ...DEFAULT_CONFIG.primaryModel, ...((config && config.primaryModel) || {}) },
      secondaryModel: { ...DEFAULT_CONFIG.secondaryModel, ...((config && config.secondaryModel) || {}) },
      challengerModel: { ...DEFAULT_CONFIG.challengerModel, ...((config && config.challengerModel) || {}) }
    };

    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI-Triad';
    this.modelVersion = normalizeText(this.config.modelVersion) || '3.0.0-triad';
    this.sessionId = `synapse-triad-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
    this.lastResult = null;

    this.primary = createBaseMastermind(this.config.primaryConfig);
    this.secondary = createBaseMastermind(this.config.secondaryConfig);
    this.challenger = createBaseMastermind(this.config.challengerConfig);
  }

  _scoreCycle(result) {
    if (!result || typeof result !== 'object') return 0.35;

    const analysis = result.analysis && typeof result.analysis === 'object' ? result.analysis : {};
    const qualityObj = analysis.quality && typeof analysis.quality === 'object' ? analysis.quality : {};

    const qualityScore = Number(qualityObj.score);
    const uncertaintyScore = Number(
      analysis.uncertainty !== undefined
        ? analysis.uncertainty
        : (result.plan && result.plan.uncertainty !== undefined ? result.plan.uncertainty : 0.5)
    );
    const contextStrengthScore = Number(analysis.contextStrength !== undefined ? analysis.contextStrength : 0.5);

    const quality = Number.isFinite(qualityScore) ? clamp(qualityScore, 0, 1) : 0.55;
    const uncertainty = Number.isFinite(uncertaintyScore) ? clamp(uncertaintyScore, 0, 1) : 0.5;
    const contextStrength = Number.isFinite(contextStrengthScore) ? clamp(contextStrengthScore, 0, 1) : 0.5;

    return clamp(quality * 0.65 + (1 - uncertainty) * 0.2 + contextStrength * 0.15, 0, 1);
  }

  _blendResponses(winnerText, supportingTexts) {
    const first = normalizeText(winnerText);
    const extras = supportingTexts.map((x) => normalizeText(x)).filter(Boolean);
    if (!this.config.enableBlendedResponse || extras.length === 0) return first;
    return `${first}\n\nAdditional perspectives:\n${extras.map((text, idx) => `${idx + 1}. ${text}`).join('\n')}`;
  }

  _mergeGoals(...goalSets) {
    const merged = [];
    const seen = new Set();
    for (const items of goalSets) {
      for (const goal of items || []) {
        if (!goal || typeof goal !== 'object') continue;
        const key = normalizeText(goal.id) || normalizeText(goal.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(goal);
      }
    }
    merged.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    return merged;
  }

  _buildConsensus(inputText, p, s, c) {
    const scored = [
      { source: 'primary', score: this._scoreCycle(p), result: p },
      { source: 'secondary', score: this._scoreCycle(s), result: s },
      { source: 'challenger', score: this._scoreCycle(c), result: c }
    ].sort((a, b) => b.score - a.score);

    const winner = scored[0];
    const runnerUp = scored[1];
    const disagreement = clamp(winner.score - runnerUp.score, 0, 1);
    const confidence = clamp(((winner.score + runnerUp.score + scored[2].score) / 3) - (disagreement * 0.15), 0, 1);

    const winnerResponse = normalizeText(winner.result && winner.result.response);
    const supporting = scored.slice(1).map((entry) => normalizeText(entry.result && entry.result.response));

    const response = this.config.consensusMode === 'winner_take_all'
      ? winnerResponse
      : this._blendResponses(winnerResponse, supporting);

    return {
      winner: winner.source,
      confidence,
      disagreement,
      scores: {
        primary: scored.find((x) => x.source === 'primary').score,
        secondary: scored.find((x) => x.source === 'secondary').score,
        challenger: scored.find((x) => x.source === 'challenger').score
      },
      ranking: scored.map((x) => ({ source: x.source, score: x.score })),
      response,
      inputHash: hashText(inputText).slice(0, 12)
    };
  }

  _buildThinkResult(inputText, p, s, c, consensus) {
    const analyses = [p, s, c].map((r) => (r && r.analysis) || {});
    const plans = [p, s, c].map((r) => (r && r.plan) || {});

    const uncertainty = clamp(
      analyses.reduce((acc, analysis, idx) => {
        const plan = plans[idx] || {};
        return acc + Number(analysis.uncertainty ?? plan.uncertainty ?? 0.5);
      }, 0) / 3,
      0,
      1
    );

    const contextStrength = clamp(
      analyses.reduce((acc, analysis) => acc + Number(analysis.contextStrength ?? 0.5), 0) / 3,
      0,
      1
    );

    return {
      id: `triad-cycle-${this.cycleCount}-${consensus.inputHash}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      receivedAt: nowIso(),
      completedAt: nowIso(),
      input: inputText,
      intent: safeClone((p && p.intent) || (s && s.intent) || (c && c.intent) || {}),
      safety: safeClone((p && p.safety) || (s && s.safety) || (c && c.safety) || { blocked: false, risk: 0, reasons: [] }),
      plan: {
        mode: normalizeText((p && p.plan && p.plan.mode) || (s && s.plan && s.plan.mode) || (c && c.plan && c.plan.mode) || 'general'),
        strategy: { name: 'Triad Consensus', style: 'triad', score: consensus.confidence },
        uncertainty,
        contextStrength,
        alternatives: [
          { source: 'primary', strategy: safeClone(p && p.plan && p.plan.strategy) },
          { source: 'secondary', strategy: safeClone(s && s.plan && s.plan.strategy) },
          { source: 'challenger', strategy: safeClone(c && c.plan && c.plan.strategy) }
        ]
      },
      response: consensus.response,
      responseMeta: {
        source: 'triad-consensus',
        winner: consensus.winner,
        consensus: safeClone(consensus)
      },
      analysis: {
        quality: { score: consensus.confidence, needsRevision: false },
        uncertainty,
        contextStrength,
        strategy: { name: 'Triad Consensus', style: 'triad', score: consensus.confidence },
        consensus: safeClone(consensus),
        primary: safeClone((p && p.analysis) || {}),
        secondary: safeClone((s && s.analysis) || {}),
        challenger: safeClone((c && c.analysis) || {})
      },
      twins: {
        primary: safeClone(p),
        secondary: safeClone(s),
        challenger: safeClone(c)
      },
      status: this.getStatus()
    };
  }

  async think(input, options = {}) {
    const safeInput = normalizeText(input);
    if (!safeInput) throw new Error('Input is required for think().');

    const baseOptions = { ...(options || {}), persist: false };

    const withModel = (modelCfg) => ({ ...baseOptions, model: { ...((baseOptions && baseOptions.model) || {}), ...modelCfg } });

    const [p, s, c] = await Promise.all([
      this.primary.think(safeInput, withModel(this.config.primaryModel)),
      this.secondary.think(safeInput, withModel(this.config.secondaryModel)),
      this.challenger.think(safeInput, withModel(this.config.challengerModel))
    ]);

    this.cycleCount += 1;
    const consensus = this._buildConsensus(safeInput, p, s, c);
    const result = this._buildThinkResult(safeInput, p, s, c, consensus);

    this.lastResult = safeClone(result);
    result.status = this.getStatus();
    this.lastResult.status = safeClone(result.status);
    return result;
  }

  async runCycle(input, source = 'user') { return this.think(input, { source }); }

  setResponder(handler) {
    if (typeof this.primary.setResponder === 'function') this.primary.setResponder(handler);
    if (typeof this.secondary.setResponder === 'function') this.secondary.setResponder(handler);
    if (typeof this.challenger.setResponder === 'function') this.challenger.setResponder(handler);
    return this;
  }

  registerTool(name, handler, options) {
    return {
      primary: typeof this.primary.registerTool === 'function' ? safeClone(this.primary.registerTool(name, handler, options)) : null,
      secondary: typeof this.secondary.registerTool === 'function' ? safeClone(this.secondary.registerTool(name, handler, options)) : null,
      challenger: typeof this.challenger.registerTool === 'function' ? safeClone(this.challenger.registerTool(name, handler, options)) : null
    };
  }

  unregisterTool(name) {
    const removed = [this.primary, this.secondary, this.challenger]
      .map((m) => (typeof m.unregisterTool === 'function' ? m.unregisterTool(name) : false));
    return removed.some(Boolean);
  }

  listTools() {
    const merged = [];
    const seen = new Set();
    for (const mind of [this.primary, this.secondary, this.challenger]) {
      const tools = typeof mind.listTools === 'function' ? mind.listTools() : [];
      for (const tool of tools) {
        const key = normalizeText(tool && tool.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(tool);
      }
    }
    return merged;
  }

  remember(kind, content, options = {}) {
    return {
      primary: typeof this.primary.remember === 'function' ? safeClone(this.primary.remember(kind, content, options)) : null,
      secondary: typeof this.secondary.remember === 'function' ? safeClone(this.secondary.remember(kind, content, options)) : null,
      challenger: typeof this.challenger.remember === 'function' ? safeClone(this.challenger.remember(kind, content, options)) : null
    };
  }

  addGoal(goal) {
    return {
      primary: typeof this.primary.addGoal === 'function' ? safeClone(this.primary.addGoal(goal)) : null,
      secondary: typeof this.secondary.addGoal === 'function' ? safeClone(this.secondary.addGoal(goal)) : null,
      challenger: typeof this.challenger.addGoal === 'function' ? safeClone(this.challenger.addGoal(goal)) : null
    };
  }

  listGoals(filters = {}) {
    return this._mergeGoals(
      typeof this.primary.listGoals === 'function' ? this.primary.listGoals(filters) : [],
      typeof this.secondary.listGoals === 'function' ? this.secondary.listGoals(filters) : [],
      typeof this.challenger.listGoals === 'function' ? this.challenger.listGoals(filters) : []
    );
  }

  addKnowledge(key, value, confidence, metadata) {
    return {
      primary: typeof this.primary.addKnowledge === 'function' ? safeClone(this.primary.addKnowledge(key, value, confidence, metadata)) : null,
      secondary: typeof this.secondary.addKnowledge === 'function' ? safeClone(this.secondary.addKnowledge(key, value, confidence, metadata)) : null,
      challenger: typeof this.challenger.addKnowledge === 'function' ? safeClone(this.challenger.addKnowledge(key, value, confidence, metadata)) : null
    };
  }

  queryKnowledge(query, limit) {
    const merged = [];
    const seen = new Set();
    for (const mind of [this.primary, this.secondary, this.challenger]) {
      const items = typeof mind.queryKnowledge === 'function' ? mind.queryKnowledge(query, limit) : [];
      for (const item of items) {
        const key = normalizeText(item && item.key) || hashText(toText(item));
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    return merged.slice(0, Number(limit) > 0 ? Number(limit) : 8);
  }

  registerFeedback(feedback) {
    const primaryFeedback = typeof this.primary.registerFeedback === 'function' ? this.primary.registerFeedback(feedback) : null;
    const secondaryFeedback = typeof this.secondary.registerFeedback === 'function' ? this.secondary.registerFeedback(feedback) : null;
    const challengerFeedback = typeof this.challenger.registerFeedback === 'function' ? this.challenger.registerFeedback(feedback) : null;

    const scores = [primaryFeedback, secondaryFeedback, challengerFeedback].map((x) => Number(x && x.globalScore)).filter(Number.isFinite);
    const globalScore = scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length, 0, 1) : 0.5;

    return {
      primary: safeClone(primaryFeedback),
      secondary: safeClone(secondaryFeedback),
      challenger: safeClone(challengerFeedback),
      globalScore
    };
  }

  getStatus() {
    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      mode: 'triad-mastermind',
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      consensusMode: this.config.consensusMode,
      lastWinner: this.lastResult && this.lastResult.responseMeta ? this.lastResult.responseMeta.winner : null,
      primary: typeof this.primary.getStatus === 'function' ? safeClone(this.primary.getStatus()) : {},
      secondary: typeof this.secondary.getStatus === 'function' ? safeClone(this.secondary.getStatus()) : {},
      challenger: typeof this.challenger.getStatus === 'function' ? safeClone(this.challenger.getStatus()) : {}
    };
  }

  exportState() {
    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      lastResult: safeClone(this.lastResult),
      config: safeClone(this.config),
      primary: typeof this.primary.exportState === 'function' ? safeClone(this.primary.exportState()) : {},
      secondary: typeof this.secondary.exportState === 'function' ? safeClone(this.secondary.exportState()) : {},
      challenger: typeof this.challenger.exportState === 'function' ? safeClone(this.challenger.exportState()) : {},
      exportedAt: nowIso()
    };
  }

  importState(state = {}) {
    const snapshot = state && typeof state === 'object' ? state : {};
    if (snapshot.sessionId) this.sessionId = normalizeText(snapshot.sessionId) || this.sessionId;
    if (snapshot.startedAt) this.startedAt = normalizeText(snapshot.startedAt) || this.startedAt;
    if (snapshot.cycleCount !== undefined) this.cycleCount = Math.max(0, Number(snapshot.cycleCount) || 0);
    if (snapshot.lastResult !== undefined) this.lastResult = safeClone(snapshot.lastResult);

    if (snapshot.primary && typeof this.primary.importState === 'function') this.primary.importState(snapshot.primary);
    if (snapshot.secondary && typeof this.secondary.importState === 'function') this.secondary.importState(snapshot.secondary);
    if (snapshot.challenger && typeof this.challenger.importState === 'function') this.challenger.importState(snapshot.challenger);
    return this.getStatus();
  }

  async reset(options = {}) {
    if (typeof this.primary.reset === 'function') await this.primary.reset(options);
    if (typeof this.secondary.reset === 'function') await this.secondary.reset(options);
    if (typeof this.challenger.reset === 'function') await this.challenger.reset(options);
    this.cycleCount = 0;
    this.lastResult = null;
    return this.getStatus();
  }
}

function createSynapseMastermind(config = {}) { return new SynapseMastermind3(config); }
function createMastermind(config = {}) { return new SynapseMastermind3(config); }

const exported = {
  SynapseMastermind3,
  SynapseMastermind: SynapseMastermind3,
  createSynapseMastermind,
  createMastermind,
  DEFAULT_CONFIG
};

if (typeof module !== 'undefined' && module.exports) module.exports = exported;
if (typeof define === 'function' && define.amd) define(() => exported);
if (typeof globalThis !== 'undefined') {
  globalThis.SynapseAI = globalThis.SynapseAI || {};
  globalThis.SynapseAI.Mastermind3 = SynapseMastermind3;
  globalThis.SynapseAI.createMastermind3 = createSynapseMastermind;
}
