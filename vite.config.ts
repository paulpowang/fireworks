import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/fireworks/',
  plugins: [react()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, port: 4173, allowedHosts: true },
});
