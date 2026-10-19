import { io } from 'socket.io-client';
import { userApi } from './api';

export function connectSocket() {
  const socket = io('/', {
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
