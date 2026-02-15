/**
 * @ch4p/engines — execution engine implementations for ch4p.
 *
 * Provides the NativeEngine (LLM provider-backed), EchoEngine (test/debug),
 * SubprocessEngine (CLI wrappers for claude-cli/codex-cli), and an
 * EngineRegistry for managing multiple engine instances.
 */

// Engines
export { NativeEngine } from './native.js';
export type { NativeEngineConfig } from './native.js';

export { EchoEngine } from './echo.js';

export { SubprocessEngine, createClaudeCliEngine, createCodexCliEngine } from './subprocess.js';
export type { SubprocessEngineConfig } from './subprocess.js';

// Registry
export { EngineRegistry } from './registry.js';
