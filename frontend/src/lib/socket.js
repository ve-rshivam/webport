import { io } from 'socket.io-client';
import { API_BASE } from './api';

let socket = null;
let activeToken = null;

export function connectRealtimeSocket(token) {
  if (!token || typeof window === 'undefined') {
    disconnectRealtimeSocket();
    return null;
  }

  const endpoint = API_BASE || window.location.origin;
  if (!socket) {
    socket = io(endpoint, {
      autoConnect: false,
      withCredentials: true,
      auth: { token },
    });
  }

  if (activeToken !== token) {
    activeToken = token;
    socket.auth = { token };
    if (socket.connected) socket.disconnect();
    socket.connect();
  } else if (!socket.connected && !socket.active) {
    socket.connect();
  }

  return socket;
}

export function disconnectRealtimeSocket() {
  activeToken = null;
  if (!socket) return;
  socket.disconnect();
  socket.auth = {};
}
