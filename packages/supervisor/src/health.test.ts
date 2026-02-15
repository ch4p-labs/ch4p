import { vi } from 'vitest';
import { HealthMonitor } from './health.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor({
      heartbeatIntervalMs: 100,
      missedThreshold: 3,
    });
  });

  afterEach(() => {
    monitor.dispose();
  });

  describe('registerChild', () => {
    it('registers a child as healthy', () => {
      monitor.registerChild('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });

    it('is idempotent', () => {
      monitor.registerChild('child-1');
      monitor.registerChild('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });
  });

  describe('unregisterChild', () => {
    it('removes the child from tracking', () => {
      monitor.registerChild('child-1');
      monitor.unregisterChild('child-1');
      expect(monitor.isHealthy('child-1')).toBe(false);
    });

    it('does not throw for unknown child', () => {
      expect(() => monitor.unregisterChild('unknown')).not.toThrow();
    });
  });

  describe('recordHeartbeat', () => {
    it('resets missed count and marks healthy', () => {
      monitor.registerChild('child-1');
      monitor.recordHeartbeat('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });

    it('emits healthy event when recovering from unhealthy', () => {
      monitor.registerChild('child-1');
      const healthyHandler = vi.fn();
      monitor.on('healthy', healthyHandler);

      // Manually make unhealthy by recording crash
      monitor.recordCrash('child-1', new Error('oops'));
      expect(monitor.isHealthy('child-1')).toBe(false);

      // Now heal it
      monitor.recordHeartbeat('child-1');
      expect(healthyHandler).toHaveBeenCalledWith('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });

    it('does nothing for unknown child', () => {
      expect(() => monitor.recordHeartbeat('unknown')).not.toThrow();
    });
  });

  describe('isHealthy', () => {
    it('returns true for healthy registered child', () => {
      monitor.registerChild('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });

    it('returns false for unregistered child', () => {
      expect(monitor.isHealthy('unknown')).toBe(false);
    });

    it('returns false after crash', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('failed'));
      expect(monitor.isHealthy('child-1')).toBe(false);
    });
  });

  describe('recordCrash', () => {
    it('marks child as unhealthy', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('crash'));
      expect(monitor.isHealthy('child-1')).toBe(false);
    });

    it('emits crashed event', () => {
      monitor.registerChild('child-1');
      const crashHandler = vi.fn();
      monitor.on('crashed', crashHandler);

      const error = new Error('boom');
      monitor.recordCrash('child-1', error);

      expect(crashHandler).toHaveBeenCalledWith('child-1', error);
    });

    it('adds to crash history', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('first'));
      monitor.recordCrash('child-1', new Error('second'));

      const history = monitor.getCrashHistory('child-1');
      expect(history).toHaveLength(2);
      expect(history[0]!.childId).toBe('child-1');
    });

    it('records crash with optional exit code and signal', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('fail'), 1, 'SIGTERM');

      const history = monitor.getCrashHistory('child-1');
      expect(history[0]!.exitCode).toBe(1);
      expect(history[0]!.signal).toBe('SIGTERM');
    });

    it('tolerates crash for unregistered child', () => {
      monitor.recordCrash('unregistered', new Error('oops'));
      expect(monitor.isHealthy('unregistered')).toBe(false);
      expect(monitor.getCrashHistory('unregistered')).toHaveLength(1);
    });
  });

  describe('recordRestart', () => {
    it('marks child as healthy after restart', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('crash'));
      expect(monitor.isHealthy('child-1')).toBe(false);

      monitor.recordRestart('child-1');
      expect(monitor.isHealthy('child-1')).toBe(true);
    });

    it('emits restarted event', () => {
      monitor.registerChild('child-1');
      const restartHandler = vi.fn();
      monitor.on('restarted', restartHandler);

      monitor.recordRestart('child-1');
      expect(restartHandler).toHaveBeenCalledWith('child-1');
    });

    it('emits restarted even for unregistered child', () => {
      const restartHandler = vi.fn();
      monitor.on('restarted', restartHandler);

      monitor.recordRestart('unknown');
      expect(restartHandler).toHaveBeenCalledWith('unknown');
    });
  });

  describe('getCrashHistory', () => {
    it('returns empty array for child with no crashes', () => {
      monitor.registerChild('child-1');
      expect(monitor.getCrashHistory('child-1')).toEqual([]);
    });

    it('returns empty array for unregistered child', () => {
      expect(monitor.getCrashHistory('unknown')).toEqual([]);
    });

    it('returns crash records in order', () => {
      monitor.registerChild('child-1');
      monitor.recordCrash('child-1', new Error('first'));
      monitor.recordCrash('child-1', new Error('second'));

      const history = monitor.getCrashHistory('child-1');
      expect(history).toHaveLength(2);
    });
  });

  describe('getOverallHealth', () => {
    it('returns true when no children are registered', () => {
      expect(monitor.getOverallHealth()).toBe(true);
    });

    it('returns true when all children are healthy', () => {
      monitor.registerChild('child-1');
      monitor.registerChild('child-2');
      expect(monitor.getOverallHealth()).toBe(true);
    });

    it('returns false when any child is unhealthy', () => {
      monitor.registerChild('child-1');
      monitor.registerChild('child-2');
      monitor.recordCrash('child-1', new Error('fail'));
      expect(monitor.getOverallHealth()).toBe(false);
    });
  });

  describe('getChildHealth', () => {
    it('returns undefined for unregistered child', () => {
      expect(monitor.getChildHealth('unknown')).toBeUndefined();
    });

    it('returns a copy of the child health state', () => {
      monitor.registerChild('child-1');
      const health = monitor.getChildHealth('child-1');
      expect(health).toBeDefined();
      expect(health!.healthy).toBe(true);
      expect(health!.missedCount).toBe(0);
      expect(health!.crashHistory).toEqual([]);
    });

    it('returns a shallow copy (not a reference)', () => {
      monitor.registerChild('child-1');
      const h1 = monitor.getChildHealth('child-1');
      const h2 = monitor.getChildHealth('child-1');
      expect(h1).not.toBe(h2);
      expect(h1!.crashHistory).not.toBe(h2!.crashHistory);
    });
  });

  describe('heartbeat timeout detection', () => {
    it('detects missed heartbeats and emits unhealthy', async () => {
      const unhealthyHandler = vi.fn();
      monitor.on('unhealthy', unhealthyHandler);

      monitor.registerChild('child-1');
      monitor.start();

      // Wait for enough check intervals to exceed the threshold
      // heartbeatIntervalMs=100, missedThreshold=3, so after ~300ms+
      await new Promise((r) => setTimeout(r, 450));

      expect(unhealthyHandler).toHaveBeenCalledWith('child-1', expect.any(Number));
      expect(monitor.isHealthy('child-1')).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('start is idempotent', () => {
      monitor.start();
      expect(() => monitor.start()).not.toThrow();
      monitor.stop();
    });

    it('stop clears the timer', () => {
      monitor.start();
      monitor.stop();
      // No further heartbeat checks should fire
    });
  });

  describe('dispose', () => {
    it('stops and clears all state', () => {
      monitor.registerChild('child-1');
      monitor.start();
      monitor.dispose();

      expect(monitor.isHealthy('child-1')).toBe(false);
      expect(monitor.getOverallHealth()).toBe(true); // no children
    });
  });
});
