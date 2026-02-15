/**
 * OTP-inspired restart strategies, ported from Lemon's BEAM patterns.
 *
 * - one-for-one: restart only the failed child
 * - rest-for-one: restart failed child + all children started after it
 * - one-for-all: restart all children when any fails
 */

export type RestartStrategy = 'one-for-one' | 'rest-for-one' | 'one-for-all';

export interface RestartPolicy {
  strategy: RestartStrategy;
  maxRestarts: number;       // max restarts within the window
  windowMs: number;          // time window for counting restarts
  backoffBaseMs: number;     // base delay for exponential backoff
  backoffMaxMs: number;      // max delay cap
}

export const DEFAULT_RESTART_POLICY: RestartPolicy = {
  strategy: 'one-for-one',
  maxRestarts: 5,
  windowMs: 60_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
};
