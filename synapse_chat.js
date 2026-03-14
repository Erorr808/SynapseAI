
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatWindow = document.getElementById('chat-window');
const statusEl = document.getElementById('model-status');
const bridgeStatusEl = document.getElementById('bridge-status');

let mastermind = null;
let usingRemoteModel = false;

function appendMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + role;

  const roleSpan = document.createElement('span');
  roleSpan.className = 'role';

  if (role === 'user') {
    roleSpan.textContent = 'You';
  } else if (role === 'assistant') {
    roleSpan.textContent = 'SynapseAI';
  } else {
    roleSpan.textContent = 'System';
  }

  const contentSpan = document.createElement('span');
  contentSpan.textContent = ': ' + text;

  wrapper.appendChild(roleSpan);
  wrapper.appendChild(contentSpan);

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeLatestSystemMessage() {
  const systemMessages = chatWindow.getElementsByClassName('system');
  if (systemMessages.length > 0) {
    const last = systemMessages[systemMessages.length - 1];
    chatWindow.removeChild(last);
  }
}

// Initialize the in-browser SynapseAI Mastermind model
try {
  if (window.SynapseAI && typeof window.SynapseAI.createMastermind === 'function') {
    mastermind = window.SynapseAI.createMastermind({
      autoPersist: false,
      autoRestore: false,
      logLevel: 'error',
      autoExecuteTools: false
    });

    // If a config + API key is present, wire the mastermind to a real LLM.
    if (window.SynapseAIConfig && window.SynapseAIConfig.apiKey) {
      usingRemoteModel = true;
      const cfg = window.SynapseAIConfig;

      mastermind.setResponder(async ({ payload }) => {
        const url = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
        const body = {
          ...payload,
          model: cfg.model || payload.model,
          temperature:
            typeof cfg.temperature === 'number' ? cfg.temperature : payload.temperature,
          max_tokens:
            typeof cfg.maxTokens === 'number' ? cfg.maxTokens : payload.max_tokens
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + cfg.apiKey
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          throw new Error('LLM HTTP error ' + res.status);
        }

        return await res.json();
      });
    }

    if (statusEl) {
      if (usingRemoteModel) {
        statusEl.textContent =
          'Model: ' +
          mastermind.modelName +
          ' (remote ' +
          (window.SynapseAIConfig && window.SynapseAIConfig.model
            ? window.SynapseAIConfig.model
            : 'LLM') +
          ')';
      } else {
        statusEl.textContent =
          'Model: ' + mastermind.modelName + ' v' + mastermind.modelVersion + ' (fallback mode)';
      }
    }

    window.SynapseAIChat = {
      mastermind,
      usingRemoteModel
    };

    if (bridgeStatusEl) {
      bridgeStatusEl.textContent = 'AllBridge: ready';
    }
  } else {
    if (statusEl) {
      statusEl.textContent = 'Mastermind.js not loaded – using dummy responses.';
    }
  }
} catch (err) {
  if (statusEl) {
    statusEl.textContent = 'Error initializing model.';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage('user', text);
  input.value = '';

  appendMessage('system', 'SynapseAI is thinking...');

  try {
    let responseText = '';

    if (mastermind && typeof mastermind.think === 'function') {
      const result = await mastermind.think(text);
      responseText = result && result.response ? result.response : '(No response text returned)';
    } else {
      responseText =
        "I couldn't initialize the SynapseAI Mastermind model. Make sure `Mastermind.js` is loaded correctly.";
    }

    removeLatestSystemMessage();
    appendMessage('assistant', responseText);
  } catch (error) {
    removeLatestSystemMessage();
    appendMessage(
      'assistant',
      'Error while running the model: ' + (error && error.message ? error.message : String(error))
    );
  }
});
