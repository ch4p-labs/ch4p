import { DEFAULT_RESTART_POLICY } from './strategies.js';
import type { RestartPolicy, RestartStrategy } from './strategies.js';

describe('strategies', () => {
  describe('DEFAULT_RESTART_POLICY', () => {
    it('uses one-for-one strategy', () => {
      expect(DEFAULT_RESTART_POLICY.strategy).toBe('one-for-one');
    });

    it('allows 5 restarts by default', () => {
      expect(DEFAULT_RESTART_POLICY.maxRestarts).toBe(5);
    });

    it('has a 60-second window', () => {
      expect(DEFAULT_RESTART_POLICY.windowMs).toBe(60_000);
    });

    it('has 1-second base backoff', () => {
      expect(DEFAULT_RESTART_POLICY.backoffBaseMs).toBe(1_000);
    });

    it('has 30-second max backoff', () => {
      expect(DEFAULT_RESTART_POLICY.backoffMaxMs).toBe(30_000);
    });
  });

  describe('RestartStrategy type', () => {
    it('accepts valid strategies', () => {
      const strategies: RestartStrategy[] = [
        'one-for-one',
        'rest-for-one',
        'one-for-all',
      ];
      expect(strategies).toHaveLength(3);
    });
  });

  describe('RestartPolicy interface', () => {
    it('can be used to create custom policies', () => {
      const custom: RestartPolicy = {
        strategy: 'one-for-all',
        maxRestarts: 3,
        windowMs: 30_000,
        backoffBaseMs: 500,
        backoffMaxMs: 10_000,
      };
      expect(custom.strategy).toBe('one-for-all');
      expect(custom.maxRestarts).toBe(3);
    });

    it('can be merged with defaults using spread', () => {
      const overrides: Partial<RestartPolicy> = { strategy: 'rest-for-one' };
      const merged: RestartPolicy = { ...DEFAULT_RESTART_POLICY, ...overrides };
      expect(merged.strategy).toBe('rest-for-one');
      expect(merged.maxRestarts).toBe(5); // inherited from default
    });
  });
});
