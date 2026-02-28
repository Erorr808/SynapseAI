/* eslint-disable max-lines */
'use strict';

const DEFAULT_CONFIG = Object.freeze({
  modelName: 'SynapseAI',
  modelVersion: '2.0.0',
  persona:
    'You are SynapseAI Mastermind: strategic, accurate, concise, and execution-focused.',
  maxEpisodes: 800,
  maxGoals: 200,
  maxKnowledgeItems: 800,
  maxDirectives: 160,
  memoryRecencyHalfLifeHours: 72,
  defaultTemperature: 0.2,
  defaultMaxTokens: 1200,
  autoPersist: true,
  autoRestore: true,
  stateKey: 'synapse_ai_mastermind_state',
  logLevel: 'warn',
  autoExecuteTools: false,
  maxPlanAlternatives: 3,
  minConfidenceForDirectAnswer: 0.42,
  clarifyingQuestionThreshold: 0.62,
  enableSelfCritique: true,
  enableAdaptiveLearning: true,
  adaptiveLearningRate: 0.2
});

const LOG_LEVEL_SCORE = Object.freeze({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
});

const DEFAULT_DIRECTIVES = Object.freeze([
  {
    id: 'mission',
    axis: 'core',
    weight: 1,
    text: 'Solve the user objective with practical, verifiable output.'
  },
  {
    id: 'clarity',
    axis: 'communication',
    weight: 0.95,
    text: 'Prefer explicit assumptions and concrete next steps over vague language.'
  },
  {
    id: 'truthfulness',
    axis: 'quality',
    weight: 1,
    text: 'Do not invent facts; communicate uncertainty and constraints directly.'
  },
  {
    id: 'safety',
    axis: 'policy',
    weight: 1,
    text: 'Refuse harmful requests and shift to safe alternatives when needed.'
  },
  {
    id: 'focus',
    axis: 'execution',
    weight: 0.9,
    text: 'Stay on task and avoid unnecessary digressions.'
  },
  {
    id: 'memory',
    axis: 'state',
    weight: 0.85,
    text: 'Use relevant memory and goals before producing an answer.'
  },
  {
    id: 'iteration',
    axis: 'workflow',
    weight: 0.85,
    text: 'Plan, execute, and evaluate before finalizing the response.'
  },
  {
    id: 'coding',
    axis: 'engineering',
    weight: 0.9,
    text: 'When coding, preserve correctness first, then optimize and polish.'
  },
  {
    id: 'brevity',
    axis: 'style',
    weight: 0.7,
    text: 'Use concise language unless the user asks for depth.'
  },
  {
    id: 'accountability',
    axis: 'ops',
    weight: 0.8,
    text: 'Track decisions and important outcomes to improve future cycles.'
  }
]);

const STATUS_ORDER = Object.freeze({
  queued: 0,
  active: 1,
  blocked: 2,
  done: 3,
  archived: 4
});

function getGlobalRoot() {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  return {};
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toText(value) {
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
}

function normalizeText(value) {
  return toText(value).replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function unique(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    output.push(item);
  }
  return output;
}

function safeClone(value) {
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
}

function hashText(text) {
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
}

function hoursBetween(isoTimeA, isoTimeB) {
  const a = new Date(isoTimeA).getTime();
  const b = new Date(isoTimeB).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  return Math.max(0, Math.abs(b - a) / (1000 * 60 * 60));
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

function normalizeDirective(input, fallbackId) {
  const directive = input && typeof input === 'object' ? input : {};
  return {
    id: normalizeText(directive.id) || fallbackId,
    axis: normalizeText(directive.axis) || 'general',
    weight: clamp(Number(directive.weight) || 0.5, 0, 1),
    text: normalizeText(directive.text) || 'No directive text provided.'
  };
}

function extractTextFromUnknownOutput(output) {
  if (!output || typeof output !== 'object') {
    return '';
  }

  const directText =
    normalizeText(output.text) ||
    normalizeText(output.response) ||
    normalizeText(output.content) ||
    normalizeText(output.output_text);

  if (directText) {
    return directText;
  }

  if (Array.isArray(output.choices) && output.choices.length > 0) {
    const firstChoice = output.choices[0] || {};
    const choiceText =
      normalizeText(firstChoice.text) ||
      normalizeText(firstChoice.message && firstChoice.message.content);
    if (choiceText) {
      return choiceText;
    }
  }

  if (Array.isArray(output.output) && output.output.length > 0) {
    const fragments = [];
    for (const item of output.output) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && typeof part === 'object') {
            const text = normalizeText(part.text || part.output_text || part.content);
            if (text) {
              fragments.push(text);
            }
          }
        }
      } else {
        const text = normalizeText(item.text || item.output_text || item.content);
        if (text) {
          fragments.push(text);
        }
      }
    }
    return normalizeText(fragments.join('\n'));
  }

  return '';
}
class EventHub {
  constructor() {
    this.listeners = new Map();
  }

  on(topic, callback) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(callback);
    return () => this.off(topic, callback);
  }

  off(topic, callback) {
    if (!this.listeners.has(topic)) {
      return;
    }
    this.listeners.get(topic).delete(callback);
    if (this.listeners.get(topic).size === 0) {
      this.listeners.delete(topic);
    }
  }

  emit(topic, payload) {
    if (!this.listeners.has(topic)) {
      return;
    }
    for (const callback of this.listeners.get(topic)) {
      try {
        callback(payload);
      } catch (error) {
        // Listener isolation protects the mastermind runtime.
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

class MemoryStore {
  constructor(maxEpisodes, halfLifeHours) {
    this.maxEpisodes = Math.max(10, maxEpisodes | 0);
    this.halfLifeHours = Math.max(1, Number(halfLifeHours) || 72);
    this.episodes = [];
  }

  add(entry) {
    const payload = entry && typeof entry === 'object' ? entry : { content: entry };
    const normalized = {
      id:
        normalizeText(payload.id) ||
        `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: normalizeText(payload.kind) || 'event',
      summary: normalizeText(payload.summary),
      content: payload.content,
      tags: unique(asArray(payload.tags).map((tag) => normalizeText(tag)).filter(Boolean)),
      importance: clamp(Number(payload.importance) || 0.4, 0, 1),
      confidence: clamp(Number(payload.confidence) || 0.5, 0, 1),
      timestamp: normalizeText(payload.timestamp) || nowIso(),
      source: normalizeText(payload.source) || 'system',
      metadata: safeClone(payload.metadata || {})
    };

    if (!normalized.summary) {
      normalized.summary = normalizeText(payload.content);
    }

    this.episodes.push(normalized);

    if (this.episodes.length > this.maxEpisodes) {
      this.episodes.splice(0, this.episodes.length - this.maxEpisodes);
    }

    return safeClone(normalized);
  }

  list(limit) {
    if (!Number.isFinite(limit)) {
      return this.episodes.map((episode) => safeClone(episode));
    }
    const safeLimit = clamp(Number(limit) || 25, 1, this.episodes.length || 1);
    return this.episodes.slice(-safeLimit).map((episode) => safeClone(episode));
  }

  clear() {
    this.episodes = [];
  }

  restore(episodes) {
    this.episodes = [];
    for (const episode of asArray(episodes)) {
      this.add(episode);
    }
  }

  retrieve(query, limit) {
    const safeLimit = clamp(Number(limit) || 8, 1, 100);
    const queryTokens = tokenize(query);
    const now = nowIso();

    if (queryTokens.length === 0) {
      return this.list(safeLimit);
    }

    const queryTokenSet = new Set(queryTokens);

    const scored = this.episodes
      .map((episode) => {
        const textBag = `${episode.summary} ${toText(episode.content)} ${episode.tags.join(' ')}`;
        const episodeTokens = tokenize(textBag);
        const overlapCount = episodeTokens.filter((token) => queryTokenSet.has(token)).length;
        const overlapScore = episodeTokens.length === 0 ? 0 : overlapCount / episodeTokens.length;

        const ageHours = hoursBetween(episode.timestamp, now);
        const recencyScore = Math.exp((-Math.log(2) * ageHours) / this.halfLifeHours);

        const score =
          overlapScore * 0.55 +
          clamp(Number(episode.importance) || 0.4, 0, 1) * 0.25 +
          recencyScore * 0.2;

        return {
          episode,
          score
        };
      })
      .filter((item) => item.score > 0.02)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map((item) => safeClone(item.episode));

    return scored;
  }
}
class GoalStore {
  constructor(maxGoals) {
    this.maxGoals = Math.max(10, maxGoals | 0);
    this.goals = [];
    this.counter = 0;
  }

  add(input) {
    const payload = input && typeof input === 'object' ? input : { title: input };
    const title = normalizeText(payload.title || payload.description);
    if (!title) {
      return null;
    }

    this.counter += 1;

    const goal = {
      id: normalizeText(payload.id) || `goal-${this.counter}`,
      title,
      status: normalizeText(payload.status) || 'queued',
      priority: clamp(Number(payload.priority) || 0.5, 0, 1),
      createdAt: normalizeText(payload.createdAt) || nowIso(),
      updatedAt: nowIso(),
      progress: clamp(Number(payload.progress) || 0, 0, 1),
      tags: unique(asArray(payload.tags).map((tag) => normalizeText(tag)).filter(Boolean)),
      notes: normalizeText(payload.notes),
      metadata: safeClone(payload.metadata || {})
    };

    this.goals.push(goal);

    if (this.goals.length > this.maxGoals) {
      this.goals
        .sort((a, b) => {
          const statusA = STATUS_ORDER[a.status] ?? 99;
          const statusB = STATUS_ORDER[b.status] ?? 99;
          if (statusA !== statusB) {
            return statusA - statusB;
          }
          return b.priority - a.priority;
        })
        .splice(this.maxGoals);
    }

    return safeClone(goal);
  }

  get(id) {
    const safeId = normalizeText(id);
    const found = this.goals.find((goal) => goal.id === safeId);
    return found ? safeClone(found) : null;
  }

  list(filters) {
    const options = filters && typeof filters === 'object' ? filters : {};
    let output = this.goals.slice();

    if (options.status) {
      const safeStatus = normalizeText(options.status);
      output = output.filter((goal) => goal.status === safeStatus);
    }

    if (options.tags && asArray(options.tags).length > 0) {
      const tagSet = new Set(asArray(options.tags).map((tag) => normalizeText(tag)).filter(Boolean));
      output = output.filter((goal) => goal.tags.some((tag) => tagSet.has(tag)));
    }

    output.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    if (Number.isFinite(options.limit)) {
      const safeLimit = clamp(Number(options.limit) || 25, 1, output.length || 1);
      output = output.slice(0, safeLimit);
    }

    return output.map((goal) => safeClone(goal));
  }

  active(limit) {
    const goals = this.list({ limit: limit || 10 }).filter(
      (goal) => goal.status === 'active' || goal.status === 'queued'
    );
    return goals;
  }

  update(id, patch) {
    const safeId = normalizeText(id);
    const delta = patch && typeof patch === 'object' ? patch : {};

    const target = this.goals.find((goal) => goal.id === safeId);
    if (!target) {
      return null;
    }

    if (delta.title !== undefined) {
      const nextTitle = normalizeText(delta.title);
      if (nextTitle) {
        target.title = nextTitle;
      }
    }

    if (delta.status !== undefined) {
      const nextStatus = normalizeText(delta.status);
      if (nextStatus) {
        target.status = nextStatus;
      }
    }

    if (delta.priority !== undefined) {
      target.priority = clamp(Number(delta.priority) || target.priority, 0, 1);
    }

    if (delta.progress !== undefined) {
      target.progress = clamp(Number(delta.progress) || target.progress, 0, 1);
    }

    if (delta.tags !== undefined) {
      target.tags = unique(asArray(delta.tags).map((tag) => normalizeText(tag)).filter(Boolean));
    }

    if (delta.notes !== undefined) {
      target.notes = normalizeText(delta.notes);
    }

    if (delta.metadata !== undefined) {
      target.metadata = safeClone(delta.metadata);
    }

    target.updatedAt = nowIso();

    return safeClone(target);
  }

  setStatus(id, status, notes) {
    return this.update(id, {
      status,
      notes
    });
  }

  remove(id) {
    const safeId = normalizeText(id);
    const before = this.goals.length;
    this.goals = this.goals.filter((goal) => goal.id !== safeId);
    return before !== this.goals.length;
  }

  clear() {
    this.goals = [];
  }

  restore(goals) {
    this.goals = [];
    this.counter = 0;
    for (const goal of asArray(goals)) {
      const added = this.add(goal);
      if (added) {
        const numericId = Number((added.id || '').replace(/[^0-9]/g, ''));
        if (Number.isFinite(numericId)) {
          this.counter = Math.max(this.counter, numericId);
        }
      }
    }
  }
}
class KnowledgeStore {
  constructor(maxItems) {
    this.maxItems = Math.max(20, maxItems | 0);
    this.items = new Map();
  }

  set(key, value, confidence, metadata) {
    const safeKey = normalizeText(key);
    if (!safeKey) {
      return null;
    }

    const item = {
      key: safeKey,
      value,
      confidence: clamp(Number(confidence) || 0.5, 0, 1),
      updatedAt: nowIso(),
      metadata: safeClone(metadata || {})
    };

    this.items.set(safeKey, item);

    if (this.items.size > this.maxItems) {
      const ordered = Array.from(this.items.values()).sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );
      const toRemove = ordered.slice(0, this.items.size - this.maxItems);
      for (const oldItem of toRemove) {
        this.items.delete(oldItem.key);
      }
    }

    return safeClone(item);
  }

  get(key) {
    const found = this.items.get(normalizeText(key));
    return found ? safeClone(found) : null;
  }

  remove(key) {
    return this.items.delete(normalizeText(key));
  }

  clear() {
    this.items.clear();
  }

  list(limit) {
    let output = Array.from(this.items.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (Number.isFinite(limit)) {
      const safeLimit = clamp(Number(limit) || 25, 1, output.length || 1);
      output = output.slice(0, safeLimit);
    }

    return output.map((item) => safeClone(item));
  }

  query(query, limit) {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return this.list(limit || 8);
    }

    const tokenSet = new Set(tokens);
    return this.list()
      .map((item) => {
        const bag = tokenize(`${item.key} ${toText(item.value)} ${toText(item.metadata)}`);
        const overlap = bag.filter((token) => tokenSet.has(token)).length;
        const score = overlap * 0.7 + item.confidence * 0.3;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, clamp(Number(limit) || 8, 1, 50))
      .map((entry) => safeClone(entry.item));
  }

  restore(items) {
    this.items.clear();
    for (const item of asArray(items)) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      this.set(item.key, item.value, item.confidence, item.metadata);
    }
  }
}

function createStorageAdapter(customAdapter) {
  if (
    customAdapter &&
    typeof customAdapter.get === 'function' &&
    typeof customAdapter.set === 'function' &&
    typeof customAdapter.remove === 'function'
  ) {
    return {
      kind: 'custom',
      get: (key) => Promise.resolve(customAdapter.get(key)),
      set: (key, value) => Promise.resolve(customAdapter.set(key, value)),
      remove: (key) => Promise.resolve(customAdapter.remove(key))
    };
  }

  const root = getGlobalRoot();
  const hasChromeStorage =
    root.chrome && root.chrome.storage && root.chrome.storage.local && root.chrome.runtime;

  if (hasChromeStorage) {
    return {
      kind: 'chrome.storage.local',
      get(key) {
        return new Promise((resolve, reject) => {
          try {
            root.chrome.storage.local.get([key], (result) => {
              const error = root.chrome.runtime.lastError;
              if (error) {
                reject(new Error(error.message || 'chrome.storage.local.get failed'));
                return;
              }
              resolve(result ? result[key] : undefined);
            });
          } catch (error) {
            reject(error);
          }
        });
      },
      set(key, value) {
        return new Promise((resolve, reject) => {
          try {
            root.chrome.storage.local.set({ [key]: value }, () => {
              const error = root.chrome.runtime.lastError;
              if (error) {
                reject(new Error(error.message || 'chrome.storage.local.set failed'));
                return;
              }
              resolve(true);
            });
          } catch (error) {
            reject(error);
          }
        });
      },
      remove(key) {
        return new Promise((resolve, reject) => {
          try {
            root.chrome.storage.local.remove([key], () => {
              const error = root.chrome.runtime.lastError;
              if (error) {
                reject(new Error(error.message || 'chrome.storage.local.remove failed'));
                return;
              }
              resolve(true);
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    };
  }

  if (typeof localStorage !== 'undefined') {
    return {
      kind: 'localStorage',
      async get(key) {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          return undefined;
        }
        try {
          return JSON.parse(raw);
        } catch (error) {
          return raw;
        }
      },
      async set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      },
      async remove(key) {
        localStorage.removeItem(key);
        return true;
      }
    };
  }

  const inMemory = new Map();
  return {
    kind: 'memory',
    async get(key) {
      return inMemory.get(key);
    },
    async set(key, value) {
      inMemory.set(key, safeClone(value));
      return true;
    },
    async remove(key) {
      inMemory.delete(key);
      return true;
    }
  };
}
class SynapseMastermind {
  constructor(config) {
    const options = config && typeof config === 'object' ? config : {};

    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };

    this.config.maxEpisodes = clamp(Number(this.config.maxEpisodes) || 800, 50, 50000);
    this.config.maxGoals = clamp(Number(this.config.maxGoals) || 200, 10, 5000);
    this.config.maxKnowledgeItems = clamp(
      Number(this.config.maxKnowledgeItems) || 800,
      20,
      50000
    );
    this.config.maxDirectives = clamp(Number(this.config.maxDirectives) || 160, 10, 5000);
    this.config.memoryRecencyHalfLifeHours = clamp(
      Number(this.config.memoryRecencyHalfLifeHours) || 72,
      1,
      24 * 365
    );
    this.config.maxPlanAlternatives = clamp(
      Number(this.config.maxPlanAlternatives) || 3,
      1,
      6
    );
    this.config.minConfidenceForDirectAnswer = clamp(
      Number(this.config.minConfidenceForDirectAnswer) || 0.42,
      0,
      1
    );
    this.config.clarifyingQuestionThreshold = clamp(
      Number(this.config.clarifyingQuestionThreshold) || 0.62,
      0,
      1
    );
    this.config.adaptiveLearningRate = clamp(
      Number(this.config.adaptiveLearningRate) || 0.2,
      0.01,
      1
    );

    this.modelName = normalizeText(this.config.modelName) || 'SynapseAI';
    this.modelVersion = normalizeText(this.config.modelVersion) || '2.0.0';
    this.persona = normalizeText(this.config.persona) || DEFAULT_CONFIG.persona;

    this.events = new EventHub();
    this.memory = new MemoryStore(
      this.config.maxEpisodes,
      this.config.memoryRecencyHalfLifeHours
    );
    this.goals = new GoalStore(this.config.maxGoals);
    this.knowledge = new KnowledgeStore(this.config.maxKnowledgeItems);
    this.storage = createStorageAdapter(this.config.storageAdapter);

    this.sessionId = `synapse-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.startedAt = nowIso();
    this.cycleCount = 0;
    this.lastResult = null;
    this.restored = false;
    this.userProfile = {
      verbosity: 'adaptive',
      format: 'plain',
      stepByStep: false,
      detailBias: 0.5,
      updatedAt: nowIso()
    };
    this.performance = {
      globalScore: 0.5,
      cycleEvaluations: 0,
      feedbackCount: 0,
      byIntent: {},
      updatedAt: nowIso()
    };
    this.strategyStats = {};

    this.directives = DEFAULT_DIRECTIVES.map((directive, index) =>
      normalizeDirective(directive, `directive-${index + 1}`)
    );

    this.tools = new Map();
    this.responder = null;

    this.remember('system-start', {
      sessionId: this.sessionId,
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      storageKind: this.storage.kind
    }, {
      importance: 0.9,
      tags: ['system', 'boot'],
      source: 'system'
    });
  }

  log(level, message, context) {
    const safeLevel = normalizeText(level) || 'info';
    const configured = normalizeText(this.config.logLevel) || 'warn';
    const score = LOG_LEVEL_SCORE[safeLevel] ?? LOG_LEVEL_SCORE.info;
    const threshold = LOG_LEVEL_SCORE[configured] ?? LOG_LEVEL_SCORE.warn;

    if (score > threshold || threshold === LOG_LEVEL_SCORE.silent) {
      return;
    }

    const line = `[${nowIso()}] [${this.modelName}] [${safeLevel}] ${normalizeText(message)}`;

    if (context === undefined) {
      console.log(line);
      return;
    }

    console.log(line, context);
  }

  on(topic, callback) {
    return this.events.on(topic, callback);
  }

  off(topic, callback) {
    this.events.off(topic, callback);
  }

  setResponder(handler) {
    if (handler !== null && typeof handler !== 'function') {
      throw new Error('Responder must be a function or null.');
    }
    this.responder = handler;
    return this;
  }

  registerTool(name, handler, options) {
    const safeName = normalizeText(name);
    if (!safeName) {
      throw new Error('Tool name is required.');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Tool ${safeName} handler must be a function.`);
    }

    const config = options && typeof options === 'object' ? options : {};

    const tool = {
      name: safeName,
      description: normalizeText(config.description) || `${safeName} tool`,
      modes: unique(asArray(config.modes).map((item) => normalizeText(item)).filter(Boolean)),
      keywords: unique(
        asArray(config.keywords)
          .map((item) => normalizeText(item).toLowerCase())
          .filter(Boolean)
      ),
      timeoutMs: clamp(Number(config.timeoutMs) || 15000, 100, 120000),
      handler
    };

    this.tools.set(safeName, tool);
    this.events.emit('tool:registered', safeClone(tool));

    return safeClone(tool);
  }

  unregisterTool(name) {
    const safeName = normalizeText(name);
    if (!safeName) {
      return false;
    }
    const removed = this.tools.delete(safeName);
    if (removed) {
      this.events.emit('tool:unregistered', { name: safeName, at: nowIso() });
    }
    return removed;
  }

  listTools() {
    return Array.from(this.tools.values()).map((tool) => {
      const { handler, ...publicTool } = tool;
      return safeClone(publicTool);
    });
  }
  remember(kind, content, options) {
    const config = options && typeof options === 'object' ? options : {};

    const entry = this.memory.add({
      kind,
      summary: normalizeText(config.summary),
      content,
      tags: config.tags || [],
      importance: config.importance,
      confidence: config.confidence,
      source: config.source || 'system',
      metadata: config.metadata || {}
    });

    this.events.emit('memory:added', safeClone(entry));
    return entry;
  }

  listMemories(limit) {
    return this.memory.list(limit);
  }

  retrieveMemories(query, limit) {
    return this.memory.retrieve(query, limit);
  }

  addKnowledge(key, value, confidence, metadata) {
    const item = this.knowledge.set(key, value, confidence, metadata);
    if (item) {
      this.events.emit('knowledge:set', safeClone(item));
    }
    return item;
  }

  queryKnowledge(query, limit) {
    return this.knowledge.query(query, limit);
  }

  addDirective(directive) {
    const normalized = normalizeDirective(
      directive,
      `directive-custom-${this.directives.length + 1}`
    );

    this.directives.push(normalized);

    if (this.directives.length > this.config.maxDirectives) {
      this.directives.sort((a, b) => b.weight - a.weight);
      this.directives = this.directives.slice(0, this.config.maxDirectives);
    }

    this.events.emit('directive:added', safeClone(normalized));

    return safeClone(normalized);
  }

  listDirectives(limit) {
    let directives = this.directives.slice().sort((a, b) => b.weight - a.weight);

    if (Number.isFinite(limit)) {
      const safeLimit = clamp(Number(limit) || 25, 1, directives.length || 1);
      directives = directives.slice(0, safeLimit);
    }

    return directives.map((directive) => safeClone(directive));
  }

  addGoal(input) {
    const goal = this.goals.add(input);
    if (goal) {
      this.events.emit('goal:added', safeClone(goal));
      this.remember('goal-added', goal, {
        summary: `Goal added: ${goal.title}`,
        importance: 0.7,
        tags: ['goal'],
        source: 'system'
      });
    }
    return goal;
  }

  updateGoal(id, patch) {
    const updated = this.goals.update(id, patch);
    if (updated) {
      this.events.emit('goal:updated', safeClone(updated));
    }
    return updated;
  }

  completeGoal(id, notes) {
    const updated = this.goals.setStatus(id, 'done', notes || 'Completed');
    if (updated) {
      updated.progress = 1;
      this.goals.update(id, { progress: 1 });
      this.events.emit('goal:completed', safeClone(updated));
    }
    return updated;
  }

  listGoals(filters) {
    return this.goals.list(filters);
  }

  getActiveGoals(limit) {
    return this.goals.active(limit);
  }

  inferUserPreferences(input) {
    const text = normalizeText(input).toLowerCase();
    const tokens = tokenize(text);
    const joined = ` ${text} `;

    let verbosity = null;
    if (
      joined.includes(' concise ') ||
      joined.includes(' brief ') ||
      joined.includes(' short answer ') ||
      tokens.includes('tldr')
    ) {
      verbosity = 'concise';
    } else if (
      joined.includes(' detailed ') ||
      joined.includes(' in depth ') ||
      joined.includes(' deep dive ')
    ) {
      verbosity = 'detailed';
    }

    let format = null;
    if (joined.includes(' json ')) {
      format = 'json';
    } else if (joined.includes(' table ')) {
      format = 'table';
    } else if (joined.includes(' bullet ') || joined.includes(' list ')) {
      format = 'bullets';
    }

    const stepByStep =
      joined.includes(' step by step ') ||
      joined.includes(' walkthrough ') ||
      joined.includes(' walk me through ');

    return {
      verbosity,
      format,
      stepByStep
    };
  }

  updateUserProfileFromInput(input) {
    const inferred = this.inferUserPreferences(input);
    const profile = { ...this.userProfile };

    if (inferred.verbosity) {
      profile.verbosity = inferred.verbosity;
      profile.detailBias = inferred.verbosity === 'detailed' ? 0.8 : 0.25;
    }

    if (inferred.format) {
      profile.format = inferred.format;
    }

    if (inferred.stepByStep) {
      profile.stepByStep = true;
    }

    profile.updatedAt = nowIso();
    this.userProfile = profile;

    if (this.config.enableAdaptiveLearning) {
      this.addKnowledge('user_profile', safeClone(this.userProfile), 0.82, {
        source: 'inference',
        updatedAt: nowIso()
      });
    }

    return safeClone(this.userProfile);
  }

  getUserProfile() {
    return safeClone(this.userProfile);
  }

  getIntentPerformance(intentName) {
    const key = normalizeText(intentName) || 'general';
    const bucket = this.performance.byIntent[key];
    if (!bucket) {
      return this.performance.globalScore;
    }
    return clamp(Number(bucket.score) || 0.5, 0, 1);
  }

  estimateContextStrength(memories, knowledge, goals) {
    const memoryScore = clamp(asArray(memories).length / 10, 0, 1);
    const knowledgeScore = clamp(asArray(knowledge).length / 8, 0, 1);
    const goalScore = clamp(asArray(goals).length / 6, 0, 1);
    return clamp(memoryScore * 0.45 + knowledgeScore * 0.35 + goalScore * 0.2, 0, 1);
  }

  computeGoalRelevance(goal, inputTokens, intent) {
    const goalText = `${goal.title} ${goal.notes || ''} ${asArray(goal.tags).join(' ')}`;
    const goalTokens = tokenize(goalText);
    const inputSet = new Set(inputTokens);
    const overlap = goalTokens.filter((token) => inputSet.has(token)).length;
    const overlapScore = goalTokens.length > 0 ? overlap / goalTokens.length : 0;

    const statusBoost =
      goal.status === 'active' ? 0.12 :
      goal.status === 'queued' ? 0.06 :
      goal.status === 'blocked' ? -0.12 :
      0;

    const ageHours = hoursBetween(goal.updatedAt || goal.createdAt, nowIso());
    const recencyScore = Math.exp((-Math.log(2) * ageHours) / 120);

    const modeBoost = asArray(goal.tags).includes(intent.primary) ? 0.08 : 0;

    return clamp(
      goal.priority * 0.48 + overlapScore * 0.28 + recencyScore * 0.16 + statusBoost + modeBoost,
      0,
      1
    );
  }

  rankGoalsForIntent(intent, input, limit) {
    const candidateGoals = this.listGoals({ limit: Math.max(30, Number(limit) || 12) }).filter(
      (goal) => goal.status !== 'done' && goal.status !== 'archived'
    );
    const inputTokens = tokenize(input);
    const safeLimit = clamp(Number(limit) || 8, 1, 30);

    return candidateGoals
      .map((goal) => ({
        goal,
        score: this.computeGoalRelevance(goal, inputTokens, intent)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map((entry) => entry.goal);
  }

  estimateUncertainty(intent, safety, contextStrength) {
    const confidencePenalty = (1 - clamp(intent.confidence, 0, 1)) * 0.42;
    const complexityPenalty = clamp(intent.complexity, 0, 1) * 0.25;
    const contextPenalty = (1 - clamp(contextStrength, 0, 1)) * 0.23;
    const urgencyPenalty = clamp(intent.urgency, 0, 1) * 0.06;
    const safetyPenalty = safety.safeMode ? 0.12 : 0;

    return clamp(
      confidencePenalty + complexityPenalty + contextPenalty + urgencyPenalty + safetyPenalty,
      0,
      1
    );
  }

  scorePlanAlternative(style, intent, safety, uncertainty, contextStrength) {
    let score = 0.5;
    const intentPerformance = this.getIntentPerformance(intent.primary);

    if (style === 'direct') {
      score += intent.urgency * 0.2 + (1 - uncertainty) * 0.15;
    } else if (style === 'analytical') {
      score += uncertainty * 0.2 + intent.complexity * 0.18;
    } else if (style === 'diagnostic') {
      score += intent.primary === 'coding' ? 0.28 : 0;
      score += intent.complexity * 0.1;
    } else if (style === 'exploratory') {
      score += intent.primary === 'creative' ? 0.27 : 0;
      score += uncertainty * 0.08;
    } else if (style === 'safe') {
      score += safety.safeMode ? 0.35 : 0;
    }

    score += contextStrength * 0.08;
    score += (intentPerformance - 0.5) * 0.12;

    return clamp(score, 0, 1);
  }

  buildPlanAlternatives(baseSteps, intent, safety, uncertainty, contextStrength) {
    const alternatives = [];

    alternatives.push({
      style: 'direct',
      name: 'Direct Execution',
      rationale: 'Fast path focused on immediate delivery.',
      steps: baseSteps.slice()
    });

    alternatives.push({
      style: 'analytical',
      name: 'Analytical Execution',
      rationale: 'Adds cross-checking and assumption validation before final answer.',
      steps: [
        ...baseSteps.slice(0, 2),
        'Validate assumptions and identify potential edge cases.',
        ...baseSteps.slice(2)
      ]
    });

    if (intent.primary === 'coding') {
      alternatives.push({
        style: 'diagnostic',
        name: 'Diagnostic Engineering',
        rationale: 'Prioritizes root-cause analysis and regression prevention.',
        steps: [
          'Pinpoint failure mode and expected behavior.',
          ...baseSteps,
          'Include concrete verification checks or tests.'
        ]
      });
    }

    if (intent.primary === 'creative' || uncertainty > 0.48) {
      alternatives.push({
        style: 'exploratory',
        name: 'Exploratory Generation',
        rationale: 'Generates alternatives before converging on the strongest output.',
        steps: [
          'Generate at least two candidate approaches.',
          'Compare tradeoffs and pick the best candidate.',
          ...baseSteps
        ]
      });
    }

    if (safety.safeMode) {
      alternatives.push({
        style: 'safe',
        name: 'Safety-First Response',
        rationale: 'Strict safety flow with refusal boundaries and safe alternatives.',
        steps: [
          'Assess policy and safety boundaries first.',
          'Refuse unsafe parts clearly.',
          'Provide helpful safe alternatives.'
        ]
      });
    }

    return alternatives
      .map((alternative) => ({
        ...alternative,
        score: this.scorePlanAlternative(
          alternative.style,
          intent,
          safety,
          uncertainty,
          contextStrength
        )
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxPlanAlternatives);
  }

  generateClarifyingQuestion(input, intent) {
    const objective = normalizeText(input);
    if (intent.primary === 'coding') {
      return 'Can you share the exact error message and the file/function you want fixed first?';
    }
    if (intent.primary === 'planning') {
      return 'What is your deadline and top priority so I can optimize the plan correctly?';
    }
    if (intent.primary === 'creative') {
      return 'Do you prefer more bold options or more practical options for this request?';
    }
    if (objective.length > 180) {
      return 'Which single outcome matters most for this request so I can optimize for it first?';
    }
    return 'Can you clarify your desired output format and the most important constraint?';
  }

  evaluateResponseQuality(responseText, input, plan, intent, safety) {
    const response = normalizeText(responseText);
    const responseTokens = tokenize(response);
    const inputTokens = tokenize(input);
    const overlap = responseTokens.filter((token) => inputTokens.includes(token)).length;
    const relevance = clamp(overlap / Math.max(5, inputTokens.length), 0, 1);

    const hasSteps = /^\s*(\d+\.|- )/m.test(response);
    const actionability =
      hasSteps ? 0.85 :
      /(next step|should|implement|run|use|fix|create)/i.test(response) ? 0.65 :
      0.35;

    const clarity =
      response.length < 40 ? 0.25 :
      response.length > 1500 ? 0.55 :
      0.78;

    const uncertaintyDisclosure = plan.needsClarification
      ? /(clarify|uncertain|assum|question)/i.test(response) ? 1 : 0.35
      : 0.9;

    const safetyScore = safety.blocked
      ? /(cannot help|safe alternative|cannot assist)/i.test(response) ? 1 : 0.5
      : 1;

    const score = clamp(
      relevance * 0.32 +
      actionability * 0.26 +
      clarity * 0.14 +
      uncertaintyDisclosure * 0.16 +
      safetyScore * 0.12,
      0,
      1
    );

    const minScore =
      this.userProfile.verbosity === 'concise' ? 0.5 : 0.56;

    return {
      score,
      needsRevision: score < minScore,
      dimensions: {
        relevance,
        actionability,
        clarity,
        uncertaintyDisclosure,
        safety: safetyScore
      },
      minScore,
      intent: intent.primary
    };
  }

  applySelfCritique(responseText, quality, plan, input) {
    if (!quality.needsRevision) {
      return responseText;
    }

    if (plan.needsClarification && plan.clarifyingQuestion) {
      return `${responseText}\n\nBefore I continue: ${plan.clarifyingQuestion}`;
    }

    if (quality.dimensions.actionability < 0.45) {
      return `${responseText}\n\nNext step: tell me your priority constraint (time, quality, or cost), and I will tailor a concrete action plan.`;
    }

    if (quality.dimensions.relevance < 0.4) {
      return `To stay aligned with your request: ${normalizeText(input)}\n\n${responseText}`;
    }

    return responseText;
  }

  recordCycleEvaluation(intent, quality, responseSource, strategyStyle) {
    if (!this.config.enableAdaptiveLearning) {
      return safeClone(this.performance);
    }

    const key = normalizeText(intent.primary) || 'general';
    const rate = this.config.adaptiveLearningRate;
    const currentGlobal = clamp(this.performance.globalScore, 0, 1);
    const nextGlobal = clamp(currentGlobal * (1 - rate) + quality.score * rate, 0, 1);

    const bucket = this.performance.byIntent[key] || { score: 0.5, count: 0 };
    bucket.count += 1;
    bucket.score = clamp(bucket.score * (1 - rate) + quality.score * rate, 0, 1);
    bucket.lastSource = normalizeText(responseSource) || 'unknown';
    bucket.updatedAt = nowIso();

    this.performance.byIntent[key] = bucket;
    this.performance.globalScore = nextGlobal;
    this.performance.cycleEvaluations += 1;
    this.performance.updatedAt = nowIso();

    const strategyKey = normalizeText(strategyStyle) || 'unknown';
    const strategyBucket = this.strategyStats[strategyKey] || { score: 0.5, count: 0 };
    strategyBucket.count += 1;
    strategyBucket.score = clamp(strategyBucket.score * (1 - rate) + quality.score * rate, 0, 1);
    strategyBucket.updatedAt = nowIso();
    this.strategyStats[strategyKey] = strategyBucket;

    return safeClone(this.performance);
  }

  registerFeedback(feedback) {
    const payload = feedback && typeof feedback === 'object' ? feedback : { value: feedback };
    const numeric = clamp(Number(payload.value), -1, 1);
    const normalized = (numeric + 1) / 2;
    const key =
      normalizeText(payload.intent) ||
      normalizeText(this.lastResult && this.lastResult.intent && this.lastResult.intent.primary) ||
      'general';
    const rate = this.config.adaptiveLearningRate;

    const bucket = this.performance.byIntent[key] || { score: 0.5, count: 0 };
    bucket.count += 1;
    bucket.score = clamp(bucket.score * (1 - rate) + normalized * rate, 0, 1);
    bucket.lastFeedback = numeric;
    bucket.updatedAt = nowIso();
    this.performance.byIntent[key] = bucket;

    this.performance.feedbackCount += 1;
    this.performance.globalScore = clamp(
      this.performance.globalScore * (1 - rate) + normalized * rate,
      0,
      1
    );
    this.performance.updatedAt = nowIso();

    this.remember('user-feedback', {
      value: numeric,
      intent: key,
      note: normalizeText(payload.note)
    }, {
      summary: `Feedback for ${key}: ${numeric}`,
      tags: ['feedback', key],
      importance: 0.75,
      source: 'user'
    });

    this.events.emit('feedback:recorded', {
      intent: key,
      value: numeric,
      at: nowIso()
    });

    return {
      intent: key,
      score: bucket.score,
      globalScore: this.performance.globalScore
    };
  }

  detectIntent(input) {
    const text = normalizeText(input);
    const tokens = tokenize(text);

    const keywordTable = {
      coding: ['code', 'debug', 'bug', 'refactor', 'function', 'api', 'test', 'javascript'],
      research: ['analyze', 'research', 'compare', 'explain', 'summarize', 'why'],
      creative: ['story', 'design', 'idea', 'brainstorm', 'creative', 'name'],
      planning: ['plan', 'roadmap', 'strategy', 'steps', 'organize', 'schedule'],
      automation: ['build', 'implement', 'generate', 'create', 'automate', 'deploy'],
      conversation: ['hello', 'hi', 'thanks', 'help', 'question']
    };

    const scores = {};

    for (const [intent, words] of Object.entries(keywordTable)) {
      const wordSet = new Set(words);
      scores[intent] = tokens.filter((token) => wordSet.has(token)).length;
    }

    let primary = 'conversation';
    let bestScore = -1;

    for (const [intent, score] of Object.entries(scores)) {
      if (score > bestScore) {
        primary = intent;
        bestScore = score;
      }
    }

    const urgencyWords = new Set(['urgent', 'asap', 'now', 'today', 'critical', 'immediately']);
    const urgencyHits = tokens.filter((token) => urgencyWords.has(token)).length;

    const complexity = clamp(tokens.length / 24, 0, 1);
    const urgency = clamp(urgencyHits * 0.35 + (text.includes('!') ? 0.15 : 0), 0, 1);

    const sortedIntents = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return {
      primary,
      secondary: sortedIntents.slice(1, 3),
      scores,
      urgency,
      complexity,
      confidence: clamp(bestScore / 3, 0.2, 0.95),
      tokens
    };
  }

  evaluateSafety(input) {
    const text = normalizeText(input).toLowerCase();

    const injectionSignals = [
      'ignore previous instructions',
      'reveal your system prompt',
      'bypass safety',
      'disable guardrails',
      'jailbreak'
    ];

    const violenceSignals = [
      'build a bomb',
      'kill someone',
      'make poison',
      'how to murder'
    ];

    const selfHarmSignals = ['how to self harm', 'how to kill myself', 'suicide method'];

    const reasons = [];

    if (injectionSignals.some((signal) => text.includes(signal))) {
      reasons.push('prompt_injection_signal');
    }

    if (violenceSignals.some((signal) => text.includes(signal))) {
      reasons.push('violent_misuse_signal');
    }

    if (selfHarmSignals.some((signal) => text.includes(signal))) {
      reasons.push('self_harm_signal');
    }

    const risk = clamp(reasons.length * 0.45, 0, 1);
    const blocked = reasons.includes('violent_misuse_signal');

    return {
      blocked,
      risk,
      reasons,
      safeMode: blocked || risk >= 0.45
    };
  }
  suggestToolCalls(intent, input) {
    const availableTools = Array.from(this.tools.values());
    if (availableTools.length === 0) {
      return [];
    }

    const tokens = tokenize(input);

    const calls = availableTools
      .map((tool) => {
        let score = 0;

        if (tool.modes.includes(intent.primary)) {
          score += 2;
        }

        if (tool.keywords.length > 0) {
          const overlap = tool.keywords.filter((word) => tokens.includes(word)).length;
          score += overlap;
        }

        return {
          tool,
          score
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => ({
        name: item.tool.name,
        reason: `Tool ${item.tool.name} matched intent ${intent.primary}`,
        timeoutMs: item.tool.timeoutMs
      }));

    return calls;
  }

  buildReasoningPlan(input, intent, safety, context) {
    const ctx = context && typeof context === 'object' ? context : {};
    const goals = this.rankGoalsForIntent(intent, input, 6);
    const memories = this.retrieveMemories(input, 10);
    const knowledge = this.queryKnowledge(input, 6);
    const contextStrength = this.estimateContextStrength(memories, knowledge, goals);

    const baseSteps = [
      'Understand objective and constraints.',
      'Collect relevant memory and active goals.',
      'Choose execution strategy and response format.',
      'Draft and verify answer quality before returning output.'
    ];

    if (intent.primary === 'coding') {
      baseSteps.splice(1, 0, 'Inspect technical context, assumptions, and potential regressions.');
    }

    if (intent.primary === 'planning') {
      baseSteps.splice(2, 0, 'Create phased action plan with priorities and checkpoints.');
    }

    if (intent.primary === 'creative') {
      baseSteps.splice(2, 0, 'Generate distinct options and refine the strongest candidate.');
    }

    if (intent.urgency >= 0.45) {
      baseSteps.unshift('Prioritize minimal-time path to useful output.');
    }

    if (safety.safeMode) {
      baseSteps.unshift('Apply strict safety filter before generating response.');
    }

    const uncertainty = this.estimateUncertainty(intent, safety, contextStrength);
    const alternatives = this.buildPlanAlternatives(
      baseSteps,
      intent,
      safety,
      uncertainty,
      contextStrength
    );
    const strategy = alternatives[0] || {
      style: 'direct',
      name: 'Direct Execution',
      rationale: 'Fallback strategy.',
      steps: baseSteps.slice(),
      score: 0.5
    };

    const needsClarification =
      uncertainty >= this.config.clarifyingQuestionThreshold ||
      (intent.confidence < this.config.minConfidenceForDirectAnswer && contextStrength < 0.35);
    const clarifyingQuestion = needsClarification
      ? this.generateClarifyingQuestion(input, intent)
      : '';

    const toolCalls = this.suggestToolCalls(intent, input);

    return {
      id: `plan-${this.cycleCount + 1}-${hashText(input).slice(0, 8)}`,
      mode: intent.primary,
      createdAt: nowIso(),
      urgency: intent.urgency,
      complexity: intent.complexity,
      uncertainty,
      contextStrength,
      safety,
      goals,
      memory: memories,
      knowledge,
      context: safeClone(ctx),
      steps: strategy.steps,
      alternatives,
      strategy,
      needsClarification,
      clarifyingQuestion,
      toolCalls
    };
  }

  buildSystemPrompt(plan) {
    const directives = this.listDirectives(10);
    const goals = asArray(plan.goals).slice(0, 5);
    const profile = this.getUserProfile();

    const directiveLines = directives
      .map((directive, index) => `${index + 1}. (${directive.axis}) ${directive.text}`)
      .join('\n');

    const goalLines = goals.length
      ? goals
          .map(
            (goal, index) =>
              `${index + 1}. ${goal.title} [status=${goal.status}, priority=${goal.priority.toFixed(2)}]`
          )
          .join('\n')
      : '1. No active goals. Prioritize current user objective.';

    const planLines = asArray(plan.steps)
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n');

    return [
      `Identity: ${this.modelName} v${this.modelVersion}`,
      `Persona: ${this.persona}`,
      `Primary Intent: ${plan.mode}`,
      `Urgency: ${plan.urgency.toFixed(2)} | Complexity: ${plan.complexity.toFixed(2)} | Uncertainty: ${plan.uncertainty.toFixed(2)}`,
      `Strategy: ${plan.strategy.name} [${plan.strategy.style}] score=${plan.strategy.score.toFixed(2)}`,
      `User Profile: verbosity=${profile.verbosity}, format=${profile.format}, stepByStep=${profile.stepByStep}`,
      '',
      'Directives:',
      directiveLines,
      '',
      'Active Goals:',
      goalLines,
      '',
      'Execution Plan:',
      planLines,
      '',
      'Clarification Policy:',
      plan.needsClarification
        ? `- Ask this clarifying question before finalizing details: ${plan.clarifyingQuestion}`
        : '- Continue directly unless the user asks to change direction.',
      '',
      'Output Contract:',
      '- Be accurate and explicit about assumptions.',
      '- Keep response pragmatic and action-oriented.',
      '- If uncertain, ask one focused clarifying question.',
      '- If blocked by safety constraints, refuse and provide safe alternatives.'
    ].join('\n');
  }

  buildMessages(input, plan, options) {
    const config = options && typeof options === 'object' ? options : {};
    const memoryContext = asArray(plan.memory)
      .slice(0, 6)
      .map((memory, index) => `${index + 1}. [${memory.kind}] ${memory.summary}`)
      .join('\n');

    const knowledgeContext = asArray(plan.knowledge)
      .slice(0, 5)
      .map((item, index) => `${index + 1}. ${item.key}: ${toText(item.value)}`)
      .join('\n');

    const alternativesContext = asArray(plan.alternatives)
      .slice(0, 3)
      .map((alt, index) => `${index + 1}. ${alt.name} (score=${alt.score.toFixed(2)}): ${alt.rationale}`)
      .join('\n');

    const profileContext = `User Preference Profile:\nverbosity=${this.userProfile.verbosity}, format=${this.userProfile.format}, stepByStep=${this.userProfile.stepByStep}`;

    const assistantContext = [
      memoryContext ? `Relevant Memory:\n${memoryContext}` : null,
      knowledgeContext ? `Relevant Knowledge:\n${knowledgeContext}` : null,
      alternativesContext ? `Plan Alternatives:\n${alternativesContext}` : null,
      profileContext,
      config.extraContext ? `Additional Context:\n${normalizeText(config.extraContext)}` : null
    ]
      .filter(Boolean)
      .join('\n\n');

    const messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(plan)
      }
    ];

    if (assistantContext) {
      messages.push({
        role: 'assistant',
        content: assistantContext
      });
    }

    messages.push({
      role: 'user',
      content: normalizeText(input)
    });

    return messages;
  }

  createModelPayload(input, plan, options) {
    const config = options && typeof options === 'object' ? options : {};
    const dynamicTemperature = Number.isFinite(config.temperature)
      ? Number(config.temperature)
      : clamp(
          this.config.defaultTemperature +
          (plan.mode === 'creative' ? 0.22 : 0) +
          (plan.mode === 'coding' ? -0.08 : 0) +
          plan.uncertainty * 0.15,
          0,
          1.2
        );

    return {
      model: normalizeText(config.model) || normalizeText(this.config.modelAlias) || 'gpt-4.1-mini',
      temperature: clamp(dynamicTemperature, 0, 2),
      max_tokens: clamp(Number(config.maxTokens) || this.config.defaultMaxTokens, 64, 16000),
      messages: this.buildMessages(input, plan, {
        extraContext: config.extraContext
      }),
      metadata: {
        engine: this.modelName,
        engine_version: this.modelVersion,
        plan_id: plan.id,
        cycle: this.cycleCount + 1,
        session_id: this.sessionId,
        strategy: plan.strategy.style,
        uncertainty: plan.uncertainty
      }
    };
  }

  async withTimeout(promise, timeoutMs, label) {
    const safeTimeout = clamp(Number(timeoutMs) || 15000, 100, 120000);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${safeTimeout}ms: ${label || 'operation'}`));
      }, safeTimeout);

      Promise.resolve(promise)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  async executePlanTools(input, plan, runtimeContext) {
    const context = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
    const outputs = [];

    for (const call of asArray(plan.toolCalls)) {
      const tool = this.tools.get(call.name);
      if (!tool) {
        continue;
      }

      const startedAt = nowIso();
      try {
        const result = await this.withTimeout(
          tool.handler({
            input,
            plan: safeClone(plan),
            context: safeClone(context),
            call: safeClone(call)
          }),
          call.timeoutMs || tool.timeoutMs,
          `tool:${tool.name}`
        );

        outputs.push({
          tool: tool.name,
          ok: true,
          startedAt,
          endedAt: nowIso(),
          result: safeClone(result)
        });
      } catch (error) {
        outputs.push({
          tool: tool.name,
          ok: false,
          startedAt,
          endedAt: nowIso(),
          error: normalizeText(error && error.message ? error.message : error)
        });
      }
    }

    return outputs;
  }

  synthesizeFallbackResponse(input, plan, safety) {
    if (safety.blocked) {
      return [
        'I cannot help with harmful or violent instructions.',
        'I can help with safe alternatives, prevention, or educational guidance instead.'
      ].join(' ');
    }

    if (plan.needsClarification && plan.clarifyingQuestion) {
      return [
        `Objective received: ${normalizeText(input)}`,
        `I need one clarification before giving the best answer: ${plan.clarifyingQuestion}`,
        'If you prefer, I can still provide a first draft with assumptions.'
      ].join('\n');
    }

    const steps = asArray(plan.steps).slice(0, 4);

    return [
      `Objective received: ${normalizeText(input)}`,
      `Mode: ${plan.mode}.`,
      'Planned approach:',
      ...steps.map((step, index) => `${index + 1}. ${step}`)
    ].join('\n');
  }

  parseResponderOutput(output, fallbackText) {
    if (typeof output === 'string') {
      return {
        text: output,
        raw: output
      };
    }

    if (output && typeof output === 'object') {
      const text = extractTextFromUnknownOutput(output) || fallbackText;

      return {
        text,
        raw: safeClone(output)
      };
    }

    return {
      text: fallbackText,
      raw: output
    };
  }

  async think(input, options) {
    const config = options && typeof options === 'object' ? options : {};
    const userInput = normalizeText(input);

    if (!userInput) {
      throw new Error('Input is required for think().');
    }

    this.updateUserProfileFromInput(userInput);

    if (this.config.autoRestore && !this.restored) {
      try {
        await this.restoreState();
      } catch (error) {
        this.log('warn', 'State restore failed during think()', error);
      }
    }

    const cycle = this.cycleCount + 1;
    const receivedAt = nowIso();
    const intent = this.detectIntent(userInput);
    const safety = this.evaluateSafety(userInput);
    const plan = this.buildReasoningPlan(userInput, intent, safety, config.context || {});

    this.remember('user-input', { text: userInput, intent, safety }, {
      summary: `User input (${intent.primary})`,
      importance: clamp(0.45 + intent.urgency * 0.35 + intent.complexity * 0.2, 0.2, 1),
      tags: ['input', intent.primary],
      source: normalizeText(config.source) || 'user'
    });

    if (config.autoGoal !== false) {
      const goalPriority = clamp(0.55 + intent.urgency * 0.25 + intent.complexity * 0.1, 0, 1);
      this.addGoal({
        title: `Handle request: ${userInput.slice(0, 120)}`,
        priority: goalPriority,
        status: 'active',
        tags: ['auto', intent.primary],
        notes: `Auto goal created in cycle ${cycle}`
      });
    }

    let toolOutputs = [];
    const shouldRunTools =
      config.executeTools === true ||
      (config.executeTools !== false && this.config.autoExecuteTools === true);

    if (shouldRunTools && !safety.blocked) {
      toolOutputs = await this.executePlanTools(userInput, plan, config.context || {});
    }

    const modelPayload = this.createModelPayload(userInput, plan, config.model || {});

    const fallbackText = this.synthesizeFallbackResponse(userInput, plan, safety);

    let response = {
      text: fallbackText,
      raw: null,
      source: 'fallback'
    };
    if (!safety.blocked && this.responder) {
      try {
        const responderOutput = await this.withTimeout(
          this.responder({
            input: userInput,
            intent: safeClone(intent),
            safety: safeClone(safety),
            plan: safeClone(plan),
            tools: safeClone(toolOutputs),
            payload: safeClone(modelPayload),
            config: safeClone(config)
          }),
          clamp(Number(config.responseTimeoutMs) || 45000, 200, 240000),
          'responder'
        );

        const parsed = this.parseResponderOutput(responderOutput, fallbackText);
        response = {
          text: parsed.text,
          raw: parsed.raw,
          source: 'responder'
        };
      } catch (error) {
        response = {
          text: `${fallbackText}\n\nResponder error: ${normalizeText(error && error.message ? error.message : error)}`,
          raw: null,
          source: 'fallback-with-responder-error'
        };
      }
    }

    const quality = this.evaluateResponseQuality(response.text, userInput, plan, intent, safety);
    if ((config.selfCritique !== false) && this.config.enableSelfCritique) {
      response.text = this.applySelfCritique(response.text, quality, plan, userInput);
    }

    this.remember('assistant-output', { text: response.text, safety, cycle }, {
      summary: `Assistant output cycle ${cycle}`,
      importance: clamp(0.55 + safety.risk * 0.2, 0.3, 0.9),
      tags: ['output', plan.mode],
      source: 'assistant',
      confidence: clamp(1 - plan.uncertainty, 0.2, 1),
      metadata: {
        quality: safeClone(quality),
        strategy: safeClone(plan.strategy)
      }
    });

    this.recordCycleEvaluation(intent, quality, response.source, plan.strategy.style);

    const result = {
      id: `cycle-${cycle}-${hashText(`${receivedAt}-${userInput}`).slice(0, 8)}`,
      cycle,
      sessionId: this.sessionId,
      receivedAt,
      completedAt: nowIso(),
      input: userInput,
      intent,
      safety,
      plan,
      tools: toolOutputs,
      payload: modelPayload,
      response: response.text,
      responseMeta: {
        source: response.source,
        raw: response.raw
      },
      analysis: {
        quality,
        uncertainty: plan.uncertainty,
        strategy: safeClone(plan.strategy),
        contextStrength: plan.contextStrength
      },
      status: this.getStatus()
    };

    this.cycleCount = cycle;
    this.lastResult = safeClone(result);

    this.events.emit('cycle:complete', safeClone(result));

    const shouldPersist =
      config.persist === true ||
      (config.persist !== false && this.config.autoPersist === true);

    if (shouldPersist) {
      try {
        await this.persistState();
      } catch (error) {
        this.log('warn', 'Persist state failed after think()', error);
      }
    }

    return result;
  }

  async runCycle(input, source) {
    return this.think(input, {
      source: source || 'user'
    });
  }

  getStatus() {
    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      memorySize: this.memory.list().length,
      activeGoals: this.getActiveGoals(20).length,
      directives: this.directives.length,
      tools: this.tools.size,
      storage: this.storage.kind,
      restored: this.restored,
      userProfile: safeClone(this.userProfile),
      learning: {
        globalScore: this.performance.globalScore,
        cycleEvaluations: this.performance.cycleEvaluations,
        feedbackCount: this.performance.feedbackCount
      }
    };
  }

  exportState() {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      cycleCount: this.cycleCount,
      lastResult: safeClone(this.lastResult),
      directives: this.listDirectives(),
      goals: this.listGoals(),
      memory: this.listMemories(),
      knowledge: this.knowledge.list(),
      userProfile: safeClone(this.userProfile),
      performance: safeClone(this.performance),
      strategyStats: safeClone(this.strategyStats),
      config: {
        modelName: this.modelName,
        modelVersion: this.modelVersion,
        persona: this.persona
      },
      exportedAt: nowIso()
    };
  }

  importState(state) {
    const snapshot = state && typeof state === 'object' ? state : {};

    if (snapshot.directives) {
      this.directives = asArray(snapshot.directives)
        .map((directive, index) =>
          normalizeDirective(directive, `directive-import-${index + 1}`)
        )
        .slice(0, this.config.maxDirectives);
    }

    if (snapshot.goals) {
      this.goals.restore(snapshot.goals);
    }

    if (snapshot.memory) {
      this.memory.restore(snapshot.memory);
    }

    if (snapshot.knowledge) {
      this.knowledge.restore(snapshot.knowledge);
    }

    if (snapshot.cycleCount !== undefined) {
      this.cycleCount = Math.max(0, Number(snapshot.cycleCount) || 0);
    }

    if (snapshot.lastResult !== undefined) {
      this.lastResult = safeClone(snapshot.lastResult);
    }

    if (snapshot.userProfile && typeof snapshot.userProfile === 'object') {
      this.userProfile = {
        ...this.userProfile,
        ...safeClone(snapshot.userProfile),
        updatedAt: nowIso()
      };
    }

    if (snapshot.performance && typeof snapshot.performance === 'object') {
      this.performance = {
        ...this.performance,
        ...safeClone(snapshot.performance),
        byIntent: {
          ...this.performance.byIntent,
          ...(snapshot.performance.byIntent || {})
        },
        updatedAt: nowIso()
      };
    }

    if (snapshot.strategyStats && typeof snapshot.strategyStats === 'object') {
      this.strategyStats = {
        ...safeClone(snapshot.strategyStats)
      };
    }

    this.events.emit('state:imported', {
      at: nowIso(),
      sessionId: this.sessionId
    });

    return this.getStatus();
  }

  async persistState() {
    const state = this.exportState();
    await this.storage.set(this.config.stateKey, state);
    this.events.emit('state:persisted', {
      key: this.config.stateKey,
      at: nowIso()
    });
    return true;
  }

  async restoreState() {
    const loaded = await this.storage.get(this.config.stateKey);
    if (!loaded || typeof loaded !== 'object') {
      this.restored = true;
      return false;
    }

    this.importState(loaded);
    this.restored = true;

    this.events.emit('state:restored', {
      key: this.config.stateKey,
      at: nowIso()
    });

    return true;
  }

  async reset(options) {
    const config = options && typeof options === 'object' ? options : {};
    const clearPersistentState = config.clearPersistentState !== false;

    this.memory.clear();
    this.goals.clear();
    this.knowledge.clear();
    this.directives = DEFAULT_DIRECTIVES.map((directive, index) =>
      normalizeDirective(directive, `directive-${index + 1}`)
    );
    this.cycleCount = 0;
    this.lastResult = null;
    this.userProfile = {
      verbosity: 'adaptive',
      format: 'plain',
      stepByStep: false,
      detailBias: 0.5,
      updatedAt: nowIso()
    };
    this.performance = {
      globalScore: 0.5,
      cycleEvaluations: 0,
      feedbackCount: 0,
      byIntent: {},
      updatedAt: nowIso()
    };
    this.strategyStats = {};

    this.remember('system-reset', { at: nowIso() }, {
      summary: 'Mastermind state reset',
      importance: 0.8,
      tags: ['system']
    });

    if (clearPersistentState) {
      await this.storage.remove(this.config.stateKey);
    }

    this.events.emit('system:reset', {
      at: nowIso(),
      clearPersistentState
    });

    return this.getStatus();
  }
}

function createSynapseMastermind(config) {
  return new SynapseMastermind(config || {});
}

const exported = {
  SynapseMastermind,
  createSynapseMastermind,
  DEFAULT_CONFIG,
  DEFAULT_DIRECTIVES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof define === 'function' && define.amd) {
  define(() => exported);
}

const root = getGlobalRoot();
root.SynapseAI = root.SynapseAI || {};
root.SynapseAI.Mastermind = SynapseMastermind;
root.SynapseAI.createMastermind = createSynapseMastermind;
root.SynapseAI.MastermindDefaults = {
  config: DEFAULT_CONFIG,
  directives: DEFAULT_DIRECTIVES
};

