/**
 * @ch4p/supervisor — OTP-inspired supervision trees.
 *
 * Ported from Lemon's BEAM patterns to Node.js.
 * Provides restart strategies, health monitoring, and supervisors
 * for worker threads and child processes.
 */

export * from './strategies.js';
export * from './health.js';
export * from './supervisor.js';
export * from './worker-supervisor.js';
export * from './process-supervisor.js';
