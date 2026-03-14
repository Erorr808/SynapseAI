'use strict';

/**
 * AllBrige.js (name as requested).
 *
 * Browser-only orchestrator that connects:
 * - SynapseAI mastermind chat
 * - Future image / video generators
 * - Basic status helpers for the UI
 */

(function (root) {
  const global = root || (typeof window !== 'undefined' ? window : {});

  function getChatMastermind() {
    if (global.SynapseAIChat && global.SynapseAIChat.mastermind) {
      return global.SynapseAIChat.mastermind;
    }
    return null;
  }

  async function chat(prompt) {
    const text = String(prompt || '').trim();
    const mastermind = getChatMastermind();
    if (!mastermind || typeof mastermind.think !== 'function') {
      return {
        ok: false,
        response: "SynapseAI mastermind is not initialized in the browser."
      };
    }
    const result = await mastermind.think(text);
    return {
      ok: true,
      response: result && result.response ? result.response : '',
      raw: result
    };
  }

  async function generateImage(prompt, options) {
    const text = String(prompt || '').trim();
    const size = (options && options.size) || '1024x1024';
    const style = (options && options.style) || 'vivid';
    return {
      engine: 'SynapseAI-AllBridge-Image',
      prompt: text,
      size,
      style,
      preview: `[AllBridge Image] style=${style} size=${size} prompt="${text}"`
    };
  }

  async function generateVideo(prompt, options) {
    const text = String(prompt || '').trim();
    const durationSeconds = Number(options && options.durationSeconds) || 10;
    const resolution = (options && options.resolution) || '1920x1080';
    return {
      engine: 'SynapseAI-AllBridge-Video',
      prompt: text,
      durationSeconds,
      resolution,
      preview: `[AllBridge Video] ${durationSeconds}s at ${resolution} prompt="${text}"`
    };
  }

  function getStatus() {
    const mastermind = getChatMastermind();
    const usingRemoteModel =
      !!(global.SynapseAIChat && global.SynapseAIChat.usingRemoteModel);
    return {
      hasMastermind: !!mastermind,
      usingRemoteModel
    };
  }

  global.SynapseAI = global.SynapseAI || {};
  global.SynapseAI.AllBridge = {
    chat,
    generateImage,
    generateVideo,
    getStatus
  };
})(typeof window !== 'undefined' ? window : undefined);

