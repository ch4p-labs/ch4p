/**
 * @ch4p/supervisor — OTP-inspired supervision trees.
 *
 * Informed by research on BEAM/Erlang patterns.
 * Provides restart strategies, health monitoring, and supervisors
 * for worker threads and child processes.
 */

export * from './strategies.js';
export * from './health.js';
export * from './supervisor.js';
export * from './worker-supervisor.js';
export * from './process-supervisor.js';
