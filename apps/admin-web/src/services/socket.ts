import { io } from 'socket.io-client';
import { adminApi } from './api';

export function connectSocket() {
  const socket = io('/', {
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
