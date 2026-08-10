import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ include: ['src'], exclude: ['src/app', 'src/embed.ts', 'src/editor', 'src/__tests__', 'src/**/__tests__', 'src/samples'] }),
  ],
  build: {
    lib: {
      entry: { index: 'src/index.ts', react: 'src/react.ts', element: 'src/element.ts' },
      name: 'Starch',
      fileName: (_format, entryName) => entryName === 'index' ? 'starch.js' : `${entryName}.js`,
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
