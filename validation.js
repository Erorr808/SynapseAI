'use strict';

/**
 * Simple client-side validation helpers.
 */

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function clampLength(text, maxLen) {
  const t = String(text || '');
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

