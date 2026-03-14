// SynapseAI browser configuration.
// 1. Put your API key and preferred model below.
// 2. Open `synapse_chat.html` in your browser and start chatting.
//
// NOTE: This runs entirely in your browser. Any API key you put
// here is visible to anyone who can open this file, so only use
// it for local / personal experiments.

window.SynapseAIConfig = {
  provider: 'openai-compatible', // 'openai-compatible' HTTP API

  // REQUIRED: paste your key here (for example an OpenAI key)
  apiKey: '',

  // Chat model name. For OpenAI, something like 'gpt-4.1-mini' or 'gpt-4.1'.
  model: 'gpt-4.1-mini',

  // Base URL for an OpenAI-compatible Chat Completions endpoint.
  // For OpenAI: 'https://api.openai.com/v1'
  baseUrl: 'https://api.openai.com/v1',

  // Optional: override temperature / max tokens.
  temperature: 0.2,
  maxTokens: 1200
};

