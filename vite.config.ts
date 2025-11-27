import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    server: {
      proxy: {
        '/files': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        '/messages': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Garante que o index.html seja o ponto de entrada principal
      rollupOptions: {
        input: 'index.html'
      }
    }
  };
});
