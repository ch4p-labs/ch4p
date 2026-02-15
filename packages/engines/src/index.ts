/**
 * @ch4p/engines — execution engine implementations for ch4p.
 *
 * Provides the NativeEngine (LLM provider-backed) and EchoEngine (test/debug),
 * plus an EngineRegistry for managing multiple engine instances.
 */

// Engines
export { NativeEngine } from './native.js';
export type { NativeEngineConfig } from './native.js';

export { EchoEngine } from './echo.js';

// Registry
export { EngineRegistry } from './registry.js';
