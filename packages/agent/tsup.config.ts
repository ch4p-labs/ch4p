import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Library entry — exported types and classes consumed by other packages.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
  },
  {
    // Worker entry — standalone script spawned by ToolWorkerPool.
    // Marked external so pnpm symlinks resolve deps at runtime; not bundled
    // into the worker file to avoid duplicating large dependency trees.
    entry: { worker: 'src/worker.ts' },
    format: ['esm'],
    dts: false,
    external: ['@ch4p/tools', '@ch4p/security', '@ch4p/core'],
  },
]);
