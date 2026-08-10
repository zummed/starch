import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/embed.ts',
      name: 'Starch',
      fileName: 'starch-embed',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
