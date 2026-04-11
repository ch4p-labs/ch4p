import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  format: ['esm'],
  dts: false,
  outDir: 'dist/server',
});
