import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-v2',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/v2/app/index.html',
    },
  },
  server: {
    port: 5174,
  },
});
