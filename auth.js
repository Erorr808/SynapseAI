'use strict';

/**
 * Minimal auth helper for SynapseAI frontends.
 * This is only a placeholder and does NOT implement real security.
 */

export function getToken() {
  return localStorage.getItem('synapseai_token') || '';
}

export function setToken(token) {
  localStorage.setItem('synapseai_token', token);
}

