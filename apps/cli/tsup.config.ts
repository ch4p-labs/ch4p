import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // Bundle all @ch4p/* workspace packages into the dist so the published
  // npm package is self-contained. Runtime deps (better-sqlite3, ws, ethers,
  // playwright-core) stay external and are listed in package.json dependencies.
  noExternal: [/^@ch4p\//],
  external: [
    'better-sqlite3',
    'ws',
    'ethers',
    'playwright-core',
  ],
});
