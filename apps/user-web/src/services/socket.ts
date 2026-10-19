import { io } from 'socket.io-client';
import { userApi } from './api';

declare const __VITE_API_URL__: string | undefined;

export function connectSocket() {
  const serverUrl = typeof __VITE_API_URL__ !== 'undefined' && __VITE_API_URL__
    ? __VITE_API_URL__.replace(/\/api\/?$/, '')
    : '/';
  const socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    auth: async callback => {
      try { callback({ token: await userApi.getValidToken() }); }
      catch { callback({}); }
    },
  });
  let refreshing = false;
  socket.on('connect_error', async error => {
    if ((error as any).data?.code !== 'AUTH_REQUIRED' || refreshing || !userApi.getToken()) return;
    refreshing = true;
    try { if (await userApi.getValidToken(true)) socket.connect(); }
    catch { /* The next authenticated request will surface session failure. */ }
    finally { refreshing = false; }
  });
  socket.on('disconnect', reason => {
    if (reason === 'io server disconnect' && userApi.getToken()) socket.connect();
  });
  return socket;
}
