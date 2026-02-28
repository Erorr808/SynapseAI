'use strict';

const fs = require('fs');
const path = require('path');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.resume();
  });
}

function pickCreateFunction(moduleExports) {
  if (!moduleExports || typeof moduleExports !== 'object') {
    throw new Error('Invalid Mastermind module exports.');
  }

  if (typeof moduleExports.createSynapseMastermind === 'function') {
    return moduleExports.createSynapseMastermind;
  }

  if (typeof moduleExports.createMastermind === 'function') {
    return moduleExports.createMastermind;
  }

  if (typeof moduleExports.SynapseMastermind === 'function') {
    return (config) => new moduleExports.SynapseMastermind(config || {});
  }

  throw new Error('No known mastermind factory was found in Mastermind.js exports.');
}

async function run() {
  const mastermindArg = process.argv[2] || path.join(__dirname, 'Mastermind.js');
  const mastermindPath = path.resolve(mastermindArg);

  if (!fs.existsSync(mastermindPath)) {
    throw new Error(`Mastermind.js not found at: ${mastermindPath}`);
  }

  const inputRaw = await readStdin();
  const request = inputRaw.trim() ? JSON.parse(inputRaw) : {};

  const command = String(request.command || 'status');
  const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
  const providedConfig = request.config && typeof request.config === 'object' ? request.config : {};
  const config = {
    ...providedConfig,
    logLevel: 'silent'
  };

  const moduleExports = require(mastermindPath);
  const createMastermind = pickCreateFunction(moduleExports);
  const mastermind = createMastermind(config);

  if (request.state && typeof request.state === 'object' && typeof mastermind.importState === 'function') {
    mastermind.importState(request.state);
  }

  let data = null;

  switch (command) {
    case 'ping':
      data = { ok: true, message: 'pong' };
      break;

    case 'think':
      data = await mastermind.think(String(payload.input || ''), payload.options || {});
      break;

    case 'run_cycle':
      data = await mastermind.runCycle(String(payload.input || ''), String(payload.source || 'user'));
      break;

    case 'status':
      data = mastermind.getStatus();
      break;

    case 'feedback':
      if (typeof mastermind.registerFeedback !== 'function') {
        throw new Error('registerFeedback() is not available on mastermind.');
      }
      data = mastermind.registerFeedback(payload.feedback || payload || {});
      break;

    case 'add_goal':
      data = mastermind.addGoal(payload.goal || payload || {});
      break;

    case 'list_goals':
      data = mastermind.listGoals(payload.filters || {});
      break;

    case 'add_knowledge':
      data = mastermind.addKnowledge(
        payload.key,
        payload.value,
        payload.confidence,
        payload.metadata || {}
      );
      break;

    case 'query_knowledge':
      data = mastermind.queryKnowledge(String(payload.query || ''), payload.limit);
      break;

    case 'remember':
      data = mastermind.remember(payload.kind || 'note', payload.content, payload.options || {});
      break;

    case 'import_state':
      if (typeof mastermind.importState !== 'function') {
        throw new Error('importState() is not available on mastermind.');
      }
      data = mastermind.importState(payload.state || {});
      break;

    case 'export_state':
      if (typeof mastermind.exportState !== 'function') {
        throw new Error('exportState() is not available on mastermind.');
      }
      data = mastermind.exportState();
      break;

    case 'reset':
      data = await mastermind.reset(payload.options || {});
      break;

    default:
      throw new Error(`Unsupported command: ${command}`);
  }

  const nextState = typeof mastermind.exportState === 'function'
    ? mastermind.exportState()
    : null;

  const response = {
    ok: true,
    command,
    data,
    state: nextState
  };

  process.stdout.write(`${JSON.stringify(response)}\n`);
}

run().catch((error) => {
  const response = {
    ok: false,
    error: error && error.message ? error.message : String(error)
  };
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exitCode = 1;
});
