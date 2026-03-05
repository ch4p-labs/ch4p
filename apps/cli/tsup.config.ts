import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // Inject the version at compile time so splash.ts can display it.
  define: {
    CH4P_VERSION: JSON.stringify(pkg.version),
  },
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
