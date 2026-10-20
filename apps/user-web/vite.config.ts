import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL || '';

  return {
    define: {
      '__VITE_API_URL__': JSON.stringify(apiUrl),
    },
    plugins: [react()],
    server: {
      port: 3001,
      host: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://127.0.0.1:4000',
          ws: true,
        },
      },
    },
  };
});
