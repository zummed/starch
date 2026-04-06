import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/app',
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist-app'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
});
