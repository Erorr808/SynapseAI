'use strict';

/**
 * Placeholder WebSocket handler for real-time SynapseAI chat.
 * You can plug this into a ws:// or wss:// endpoint later.
 */

export function connectSocket(url, onMessage) {
  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    if (typeof onMessage === 'function') {
      onMessage(event.data);
    }
  };
  return socket;
}

