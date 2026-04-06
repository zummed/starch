import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ include: ['src'], exclude: ['src/app', 'src/embed.ts', 'src/__tests__', 'src/**/__tests__', 'src/samples'] }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Starch',
      fileName: 'starch',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^prosemirror-/,
        /^@prosemirror-adapter\//,
      ],
    },
  },
});
