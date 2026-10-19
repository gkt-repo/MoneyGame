import { io } from 'socket.io-client';
import { adminApi } from './api';

declare const __VITE_API_URL__: string | undefined;

export function connectSocket() {
  const serverUrl = typeof __VITE_API_URL__ !== 'undefined' && __VITE_API_URL__
    ? __VITE_API_URL__.replace(/\/api\/?$/, '')
    : '/';
  const socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    auth: async callback => {
      try { callback({ token: await adminApi.getValidToken() }); }
      catch { callback({}); }
    },
  });
  let refreshing = false;
  socket.on('connect_error', async error => {
    if ((error as any).data?.code !== 'AUTH_REQUIRED' || refreshing || !adminApi.getToken()) return;
    refreshing = true;
    try { if (await adminApi.getValidToken(true)) socket.connect(); }
    catch { /* The next authenticated request will surface session failure. */ }
    finally { refreshing = false; }
  });
  socket.on('disconnect', reason => {
    if (reason === 'io server disconnect' && adminApi.getToken()) socket.connect();
  });
  return socket;
}
