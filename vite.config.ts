import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], exclude: ['src/main.tsx', 'src/App.tsx'] }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Starch',
      fileName: 'starch',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@codemirror\//, /^@lezer\//],
    },
  },
});
