import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/v2/app',
  base: './',
  resolve: {
    alias: {
      // Allow imports that traverse up out of the root
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-v2'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    fs: {
      // Allow serving files from the entire project (needed for imports from src/)
      allow: [path.resolve(__dirname)],
    },
  },
});
