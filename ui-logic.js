'use strict';

/**
 * UI glue helpers for the SynapseAI chat page.
 * Currently not wired, but available if you want to extend the UI.
 */

export function setLoading(isLoading) {
  const form = document.getElementById('chat-form');
  if (!form) return;
  form.querySelector('button[type="submit"]').disabled = !!isLoading;
}

