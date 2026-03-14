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
  modelName: 'SynapseAI-Trio',
  modelVersion: '3.0.0-trio',
  consensusMode: 'hybrid', // hybrid | winner_take_all | review_first
  autoPersist: true,
  enableBlendedResponse: true,
  triadConfig: {
    planner: {
      modelName: 'SynapseAI-Planner',
      stateKey: 'synapse_ai_mastermind_planner_state',
      defaultTemperature: 0.22
    },
    builder: {
      modelName: 'SynapseAI-Builder',
      stateKey: 'synapse_ai_mastermind_builder_state',
      defaultTemperature: 0.32
    },
    reviewer: {
      modelName: 'SynapseAI-Reviewer',
      stateKey: 'synapse_ai_mastermind_reviewer_state',
      defaultTemperature: 0.16
    }
  },
  plannerModel: {
    temperature: 0.22
  },
  builderModel: {
    temperature: 0.32
  },
  reviewerModel: {
    temperature: 0.16
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

const avg = (values, defaultValue = 0) => {
  const nums = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!nums.length) {
    return defaultValue;
  }
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
};

class SynapseMastermind3 {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      triadConfig: {
        ...DEFAULT_CONFIG.triadConfig,
        ...((config && config.triadConfig) || {}),
        planner: {
          ...DEFAULT_CONFIG.triadConfig.planner,
          ...((config && config.triadConfig && config.triadConfig.planner) || {})
        },
        builder: {
          ...DEFAULT_CONFIG.triadConfig.builder,
          ...((config && config.triadConfig && config.triadConfig.builder) || {})
        },
        reviewer: {
          ...DEFAULT_CONFIG.triadConfig.reviewer,
          ...((config && config.triadConfig && config.triadConfig.reviewer) || {})
        }
      },
      plannerModel: {
        ...DEFAULT_CONFIG.plannerModel,
        ...((config && config.plannerModel) || {})
      },
      builderModel: {
        ...DEFAULT_CONFIG.builderModel,
        ...((config && config.builderModel) || {})
      },
      reviewerModel: {
        ...DEFAULT_CONFIG.reviewerModel,
        ...((config && config.reviewerModel) || {})
      }
    };

    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI-Trio';
    this.modelVersion = normalizeText(this.config.modelVersion) || '3.0.0-trio';
    this.sessionId = `synapse-trio-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
    this.lastResult = null;

    this.planner = createBaseMastermind(this.config.triadConfig.planner);
    this.builder = createBaseMastermind(this.config.triadConfig.builder);
    this.reviewer = createBaseMastermind(this.config.triadConfig.reviewer);
  }

  _scoreCycle(result) {
    if (!result || typeof result !== 'object') {
      return 0.32;
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
      quality * 0.6 + (1 - uncertainty) * 0.25 + contextStrength * 0.15,
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

  _mergeGoals(...collections) {
    const merged = [];
    const seen = new Set();

    const append = (items, source) => {
      for (const goal of items || []) {
        if (!goal || typeof goal !== 'object') {
          continue;
        }
        const key = normalizeText(goal.id) || normalizeText(goal.title) || hashText(toText(goal));
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        merged.push({
          ...goal,
          source: goal.source || source
        });
      }
    };

    const labels = ['planner', 'builder', 'reviewer'];
    collections.forEach((items, index) => append(items, labels[index] || 'unknown'));

    merged.sort((a, b) => {
      const aPriority = Number(a.priority) || 0;
      const bPriority = Number(b.priority) || 0;
      return bPriority - aPriority;
    });

    return merged;
  }

  _buildReviewPrompt(inputText, plannerResult, builderResult) {
    const plannerResponse = normalizeText(plannerResult && plannerResult.response);
    const builderResponse = normalizeText(builderResult && builderResult.response);

    return [
      'You are the reviewer in a triad mastermind. Fuse the best ideas and correct weaknesses.',
      `User request: ${inputText}`,
      plannerResponse ? `Planner candidate:\n${plannerResponse}` : '',
      builderResponse ? `Builder candidate:\n${builderResponse}` : '',
      'Return a concise, actionable response only.'
    ].filter(Boolean).join('\n\n');
  }

  _buildConsensus(inputText, plannerResult, builderResult, reviewerResult) {
    const plannerScore = this._scoreCycle(plannerResult);
    const builderScore = this._scoreCycle(builderResult);
    const reviewerScore = this._scoreCycle(reviewerResult);

    const scores = {
      planner: plannerScore,
      builder: builderScore,
      reviewer: reviewerScore
    };

    const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const winner = ordered[0][0];
    const runnerUp = ordered[1][0];
    const disagreement = clamp(ordered[0][1] - ordered[2][1], 0, 1);
    const confidence = clamp(
      ordered[0][1] * 0.6 + ordered[1][1] * 0.25 + ordered[2][1] * 0.15 - disagreement * 0.15,
      0,
      1
    );

    const responses = {
      planner: normalizeText(plannerResult && plannerResult.response),
      builder: normalizeText(builderResult && builderResult.response),
      reviewer: normalizeText(reviewerResult && reviewerResult.response)
    };

    let response;
    if (this.config.consensusMode === 'winner_take_all') {
      response = responses[winner] || responses.reviewer || responses.builder || responses.planner;
    } else if (this.config.consensusMode === 'review_first') {
      response = responses.reviewer || responses[winner] || responses[runnerUp];
    } else {
      const leader = responses[winner] || '';
      const supporting = responses.reviewer || responses[runnerUp] || '';
      response = this._blendResponses(leader, supporting, winner);
    }

    return {
      winner,
      runnerUp,
      confidence,
      disagreement,
      scores,
      response,
      usedReviewer: Boolean(responses.reviewer),
      inputHash: hashText(inputText).slice(0, 12)
    };
  }

  _buildThinkResult(inputText, plannerResult, builderResult, reviewerResult, consensus) {
    const plannerPlan = (plannerResult && plannerResult.plan) || {};
    const builderPlan = (builderResult && builderResult.plan) || {};
    const reviewerPlan = (reviewerResult && reviewerResult.plan) || {};

    const plannerAnalysis = (plannerResult && plannerResult.analysis) || {};
    const builderAnalysis = (builderResult && builderResult.analysis) || {};
    const reviewerAnalysis = (reviewerResult && reviewerResult.analysis) || {};

    const uncertainty = clamp(
      avg([
        plannerAnalysis.uncertainty ?? plannerPlan.uncertainty ?? 0.5,
        builderAnalysis.uncertainty ?? builderPlan.uncertainty ?? 0.5,
        reviewerAnalysis.uncertainty ?? reviewerPlan.uncertainty ?? 0.5
      ], 0.5),
      0,
      1
    );

    const contextStrength = clamp(
      avg([
        plannerAnalysis.contextStrength ?? 0.5,
        builderAnalysis.contextStrength ?? 0.5,
        reviewerAnalysis.contextStrength ?? 0.5
      ], 0.5),
      0,
      1
    );

    const alternatives = [];
    if (plannerPlan.strategy) {
      alternatives.push({
        source: 'planner',
        strategy: safeClone(plannerPlan.strategy)
      });
    }
    if (builderPlan.strategy) {
      alternatives.push({
        source: 'builder',
        strategy: safeClone(builderPlan.strategy)
      });
    }
    if (reviewerPlan.strategy) {
      alternatives.push({
        source: 'reviewer',
        strategy: safeClone(reviewerPlan.strategy)
      });
    }

    const intent = safeClone(plannerResult && plannerResult.intent)
      || safeClone(builderResult && builderResult.intent)
      || safeClone(reviewerResult && reviewerResult.intent)
      || {};

    const safety = safeClone(plannerResult && plannerResult.safety)
      || safeClone(builderResult && builderResult.safety)
      || safeClone(reviewerResult && reviewerResult.safety)
      || { blocked: false, risk: 0, reasons: [] };

    return {
      id: `triad-cycle-${this.cycleCount}-${consensus.inputHash}`,
      cycle: this.cycleCount,
      sessionId: this.sessionId,
      receivedAt: nowIso(),
      completedAt: nowIso(),
      input: inputText,
      intent,
      safety,
      plan: {
        mode: normalizeText(plannerPlan.mode) || normalizeText(builderPlan.mode) || 'general',
        strategy: {
          name: 'Triad Hybrid Consensus',
          style: 'triad',
          score: consensus.confidence
        },
        alternatives,
        uncertainty,
        contextStrength,
        plannerPlan: safeClone(plannerPlan),
        builderPlan: safeClone(builderPlan),
        reviewerPlan: safeClone(reviewerPlan)
      },
      response: consensus.response,
      responseMeta: {
        source: 'triad-consensus',
        winner: consensus.winner,
        runnerUp: consensus.runnerUp,
        reviewerUsed: consensus.usedReviewer,
        consensus: safeClone(consensus)
      },
      analysis: {
        quality: {
          score: consensus.confidence,
          needsRevision: consensus.disagreement > 0.35
        },
        uncertainty,
        contextStrength,
        strategy: {
          name: 'Triad Hybrid Consensus',
          style: 'triad',
          score: consensus.confidence
        },
        consensus: safeClone(consensus),
        planner: safeClone(plannerAnalysis),
        builder: safeClone(builderAnalysis),
        reviewer: safeClone(reviewerAnalysis)
      },
      triad: {
        planner: safeClone(plannerResult),
        builder: safeClone(builderResult),
        reviewer: safeClone(reviewerResult)
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

    const plannerOptions = {
      ...baseOptions,
      model: {
        ...((baseOptions && baseOptions.model) || {}),
        ...this.config.plannerModel
      }
    };

    const builderOptions = {
      ...baseOptions,
      model: {
        ...((baseOptions && baseOptions.model) || {}),
        ...this.config.builderModel
      }
    };

    const reviewerOptions = {
      ...baseOptions,
      model: {
        ...((baseOptions && baseOptions.model) || {}),
        ...this.config.reviewerModel
      }
    };

    const [plannerResult, builderResult] = await Promise.all([
      this.planner.think(safeInput, plannerOptions),
      this.builder.think(safeInput, builderOptions)
    ]);

    let reviewerResult = null;
    try {
      const reviewPrompt = this._buildReviewPrompt(safeInput, plannerResult, builderResult);
      reviewerResult = await this.reviewer.think(reviewPrompt, {
        ...reviewerOptions,
        purpose: 'review'
      });
    } catch (error) {
      reviewerResult = {
        response: '',
        error: String(error)
      };
    }

    this.cycleCount += 1;
    const consensus = this._buildConsensus(safeInput, plannerResult, builderResult, reviewerResult);
    const result = this._buildThinkResult(safeInput, plannerResult, builderResult, reviewerResult, consensus);

    this.lastResult = safeClone(result);
    result.status = this.getStatus();
    this.lastResult.status = safeClone(result.status);
    return result;
  }

  async runCycle(input, source = 'user') {
    return this.think(input, { source });
  }

  setResponder(handler) {
    if (typeof this.planner.setResponder === 'function') {
      this.planner.setResponder(handler);
    }
    if (typeof this.builder.setResponder === 'function') {
      this.builder.setResponder(handler);
    }
    if (typeof this.reviewer.setResponder === 'function') {
      this.reviewer.setResponder(handler);
    }
    return this;
  }

  registerTool(name, handler, options) {
    const plannerTool = typeof this.planner.registerTool === 'function'
      ? this.planner.registerTool(name, handler, options)
      : null;
    const builderTool = typeof this.builder.registerTool === 'function'
      ? this.builder.registerTool(name, handler, options)
      : null;
    const reviewerTool = typeof this.reviewer.registerTool === 'function'
      ? this.reviewer.registerTool(name, handler, options)
      : null;
    return {
      planner: safeClone(plannerTool),
      builder: safeClone(builderTool),
      reviewer: safeClone(reviewerTool)
    };
  }

  unregisterTool(name) {
    const plannerRemoved = typeof this.planner.unregisterTool === 'function'
      ? this.planner.unregisterTool(name)
      : false;
    const builderRemoved = typeof this.builder.unregisterTool === 'function'
      ? this.builder.unregisterTool(name)
      : false;
    const reviewerRemoved = typeof this.reviewer.unregisterTool === 'function'
      ? this.reviewer.unregisterTool(name)
      : false;
    return plannerRemoved || builderRemoved || reviewerRemoved;
  }

  listTools() {
    const plannerTools = typeof this.planner.listTools === 'function'
      ? this.planner.listTools()
      : [];
    const builderTools = typeof this.builder.listTools === 'function'
      ? this.builder.listTools()
      : [];
    const reviewerTools = typeof this.reviewer.listTools === 'function'
      ? this.reviewer.listTools()
      : [];

    const merged = [];
    const seen = new Set();
    const append = (items) => {
      for (const item of items || []) {
        const key = normalizeText(item && item.name) || hashText(toText(item));
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        merged.push(item);
      }
    };

    append(plannerTools);
    append(builderTools);
    append(reviewerTools);

    return merged;
  }

  remember(kind, content, options = {}) {
    const plannerMemory = typeof this.planner.remember === 'function'
      ? this.planner.remember(kind, content, options)
      : null;
    const builderMemory = typeof this.builder.remember === 'function'
      ? this.builder.remember(kind, content, options)
      : null;
    const reviewerMemory = typeof this.reviewer.remember === 'function'
      ? this.reviewer.remember(kind, content, options)
      : null;
    return {
      planner: safeClone(plannerMemory),
      builder: safeClone(builderMemory),
      reviewer: safeClone(reviewerMemory)
    };
  }

  addGoal(goal) {
    const plannerGoal = typeof this.planner.addGoal === 'function'
      ? this.planner.addGoal(goal)
      : null;
    const builderGoal = typeof this.builder.addGoal === 'function'
      ? this.builder.addGoal(goal)
      : null;
    const reviewerGoal = typeof this.reviewer.addGoal === 'function'
      ? this.reviewer.addGoal(goal)
      : null;
    return {
      planner: safeClone(plannerGoal),
      builder: safeClone(builderGoal),
      reviewer: safeClone(reviewerGoal)
    };
  }

  listGoals(filters = {}) {
    const plannerGoals = typeof this.planner.listGoals === 'function'
      ? this.planner.listGoals(filters)
      : [];
    const builderGoals = typeof this.builder.listGoals === 'function'
      ? this.builder.listGoals(filters)
      : [];
    const reviewerGoals = typeof this.reviewer.listGoals === 'function'
      ? this.reviewer.listGoals(filters)
      : [];

    return this._mergeGoals(plannerGoals, builderGoals, reviewerGoals);
  }

  addKnowledge(key, value, confidence, metadata) {
    const plannerItem = typeof this.planner.addKnowledge === 'function'
      ? this.planner.addKnowledge(key, value, confidence, metadata)
      : null;
    const builderItem = typeof this.builder.addKnowledge === 'function'
      ? this.builder.addKnowledge(key, value, confidence, metadata)
      : null;
    const reviewerItem = typeof this.reviewer.addKnowledge === 'function'
      ? this.reviewer.addKnowledge(key, value, confidence, metadata)
      : null;
    return {
      planner: safeClone(plannerItem),
      builder: safeClone(builderItem),
      reviewer: safeClone(reviewerItem)
    };
  }

  queryKnowledge(query, limit) {
    const plannerItems = typeof this.planner.queryKnowledge === 'function'
      ? this.planner.queryKnowledge(query, limit)
      : [];
    const builderItems = typeof this.builder.queryKnowledge === 'function'
      ? this.builder.queryKnowledge(query, limit)
      : [];
    const reviewerItems = typeof this.reviewer.queryKnowledge === 'function'
      ? this.reviewer.queryKnowledge(query, limit)
      : [];

    const merged = [];
    const seen = new Set();
    for (const item of [...plannerItems, ...builderItems, ...reviewerItems]) {
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
    const plannerFeedback = typeof this.planner.registerFeedback === 'function'
      ? this.planner.registerFeedback(feedback)
      : null;
    const builderFeedback = typeof this.builder.registerFeedback === 'function'
      ? this.builder.registerFeedback(feedback)
      : null;
    const reviewerFeedback = typeof this.reviewer.registerFeedback === 'function'
      ? this.reviewer.registerFeedback(feedback)
      : null;

    const plannerScore = Number(plannerFeedback && plannerFeedback.globalScore);
    const builderScore = Number(builderFeedback && builderFeedback.globalScore);
    const reviewerScore = Number(reviewerFeedback && reviewerFeedback.globalScore);

    const avgScore = clamp(
      avg([
        Number.isFinite(plannerScore) ? plannerScore : 0.5,
        Number.isFinite(builderScore) ? builderScore : 0.5,
        Number.isFinite(reviewerScore) ? reviewerScore : 0.5
      ], 0.5),
      0,
      1
    );

    return {
      planner: safeClone(plannerFeedback),
      builder: safeClone(builderFeedback),
      reviewer: safeClone(reviewerFeedback),
      globalScore: avgScore
    };
  }

  getStatus() {
    const plannerStatus = typeof this.planner.getStatus === 'function'
      ? this.planner.getStatus()
      : {};
    const builderStatus = typeof this.builder.getStatus === 'function'
      ? this.builder.getStatus()
      : {};
    const reviewerStatus = typeof this.reviewer.getStatus === 'function'
      ? this.reviewer.getStatus()
      : {};

    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      mode: 'triad-mastermind',
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      consensusMode: this.config.consensusMode,
      lastWinner: this.lastResult && this.lastResult.responseMeta
        ? this.lastResult.responseMeta.winner
        : null,
      planner: safeClone(plannerStatus),
      builder: safeClone(builderStatus),
      reviewer: safeClone(reviewerStatus)
    };
  }

  exportState() {
    const plannerState = typeof this.planner.exportState === 'function'
      ? this.planner.exportState()
      : {};
    const builderState = typeof this.builder.exportState === 'function'
      ? this.builder.exportState()
      : {};
    const reviewerState = typeof this.reviewer.exportState === 'function'
      ? this.reviewer.exportState()
      : {};

    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      lastResult: safeClone(this.lastResult),
      config: safeClone(this.config),
      planner: safeClone(plannerState),
      builder: safeClone(builderState),
      reviewer: safeClone(reviewerState),
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

    if (snapshot.planner && typeof this.planner.importState === 'function') {
      this.planner.importState(snapshot.planner);
    }
    if (snapshot.builder && typeof this.builder.importState === 'function') {
      this.builder.importState(snapshot.builder);
    }
    if (snapshot.reviewer && typeof this.reviewer.importState === 'function') {
      this.reviewer.importState(snapshot.reviewer);
    }

    return this.getStatus();
  }

  async reset(options = {}) {
    if (typeof this.planner.reset === 'function') {
      await this.planner.reset(options);
    }
    if (typeof this.builder.reset === 'function') {
      await this.builder.reset(options);
    }
    if (typeof this.reviewer.reset === 'function') {
      await this.reviewer.reset(options);
    }

    this.cycleCount = 0;
    this.lastResult = null;
    return this.getStatus();
  }
}

function createSynapseMastermind(config = {}) {
  return new SynapseMastermind3(config);
}

function createMastermind(config = {}) {
  return new SynapseMastermind3(config);
}

const exported = {
  SynapseMastermind3,
  SynapseMastermind: SynapseMastermind3,
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
  globalThis.SynapseAI.Mastermind3 = SynapseMastermind3;
  globalThis.SynapseAI.createMastermind3 = createSynapseMastermind;
}
