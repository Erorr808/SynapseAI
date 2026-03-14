'use strict';

/**
 * Very small state store for chat history in the browser.
 */

const state = {
  messages: []
};

export function addMessage(role, content) {
  state.messages.push({ role, content, at: new Date().toISOString() });
}

export function getMessages() {
  return state.messages.slice();
}

