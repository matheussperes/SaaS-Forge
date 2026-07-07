import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend em 5173; API em 5050 (proxy de /api) — portas isoladas do orquestrador.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
});
