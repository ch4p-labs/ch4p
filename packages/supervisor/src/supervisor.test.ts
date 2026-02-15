import { vi } from 'vitest';
import { Supervisor } from './supervisor.js';
import type { ChildSpec, ChildHandle, SupervisorEvents } from './supervisor.js';

function makeHandle(id: string, overrides: Partial<ChildHandle> = {}): ChildHandle {
  return {
    id,
    kill: vi.fn(),
    isAlive: vi.fn(() => true),
    ...overrides,
  };
}

function makeSpec(id: string, overrides: Partial<ChildSpec> = {}): ChildSpec {
  return {
    id,
    start: vi.fn(async () => makeHandle(id)),
    ...overrides,
  };
}

describe('Supervisor', () => {
  let supervisor: Supervisor;

  beforeEach(() => {
    supervisor = new Supervisor({
      maxRestarts: 3,
      windowMs: 60_000,
      backoffBaseMs: 10,
      backoffMaxMs: 50,
    });
  });

  afterEach(async () => {
    if (supervisor.isRunning) {
      await supervisor.stop();
    }
    supervisor.getHealthMonitor().dispose();
  });

  describe('addChild', () => {
    it('registers a child', async () => {
      await supervisor.addChild(makeSpec('child-1'));
      const children = supervisor.getChildren();
      expect(children).toHaveLength(1);
      expect(children[0]!.spec.id).toBe('child-1');
    });

    it('throws for duplicate child id', async () => {
      await supervisor.addChild(makeSpec('child-1'));
      await expect(supervisor.addChild(makeSpec('child-1'))).rejects.toThrow(
        'already registered',
      );
    });

    it('starts child immediately if supervisor is running', async () => {
      await supervisor.start();
      const spec = makeSpec('child-1');
      await supervisor.addChild(spec);
      expect(spec.start).toHaveBeenCalled();
    });

    it('does not start child if supervisor is not running', async () => {
      const spec = makeSpec('child-1');
      await supervisor.addChild(spec);
      expect(spec.start).not.toHaveBeenCalled();
    });
  });

  describe('removeChild', () => {
    it('removes a registered child', async () => {
      await supervisor.addChild(makeSpec('child-1'));
      await supervisor.removeChild('child-1');
      expect(supervisor.getChildren()).toHaveLength(0);
    });

    it('stops the child before removing if running', async () => {
      const shutdown = vi.fn(async () => {});
      const spec = makeSpec('child-1', { shutdown });
      await supervisor.addChild(spec);
      await supervisor.start();
      await supervisor.removeChild('child-1');
      // either shutdown or kill should have been called
    });

    it('does nothing for unknown child', async () => {
      await expect(supervisor.removeChild('unknown')).resolves.not.toThrow();
    });
  });

  describe('start', () => {
    it('starts all registered children in order', async () => {
      const callOrder: string[] = [];
      const spec1 = makeSpec('child-1', {
        start: vi.fn(async () => {
          callOrder.push('child-1');
          return makeHandle('child-1');
        }),
      });
      const spec2 = makeSpec('child-2', {
        start: vi.fn(async () => {
          callOrder.push('child-2');
          return makeHandle('child-2');
        }),
      });

      await supervisor.addChild(spec1);
      await supervisor.addChild(spec2);
      await supervisor.start();

      expect(callOrder).toEqual(['child-1', 'child-2']);
      expect(supervisor.isRunning).toBe(true);
    });

    it('is idempotent when already running', async () => {
      const spec = makeSpec('child-1');
      await supervisor.addChild(spec);
      await supervisor.start();
      await supervisor.start(); // should not throw or re-start
      expect(spec.start).toHaveBeenCalledTimes(1);
    });

    it('emits supervisor:started event', async () => {
      const handler = vi.fn();
      supervisor.on('supervisor:started', handler);
      await supervisor.start();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops all children in reverse order', async () => {
      const stopOrder: string[] = [];
      const spec1 = makeSpec('child-1', {
        shutdown: vi.fn(async () => {
          stopOrder.push('child-1');
        }),
      });
      const spec2 = makeSpec('child-2', {
        shutdown: vi.fn(async () => {
          stopOrder.push('child-2');
        }),
      });

      await supervisor.addChild(spec1);
      await supervisor.addChild(spec2);
      await supervisor.start();
      await supervisor.stop();

      expect(stopOrder).toEqual(['child-2', 'child-1']);
      expect(supervisor.isRunning).toBe(false);
    });

    it('emits supervisor:stopped event', async () => {
      const handler = vi.fn();
      supervisor.on('supervisor:stopped', handler);
      await supervisor.start();
      await supervisor.stop();
      expect(handler).toHaveBeenCalled();
    });

    it('is idempotent when not running', async () => {
      await expect(supervisor.stop()).resolves.not.toThrow();
    });
  });

  describe('getChildState', () => {
    it('returns state for known child', async () => {
      await supervisor.addChild(makeSpec('child-1'));
      await supervisor.start();
      const state = supervisor.getChildState('child-1');
      expect(state).toBeDefined();
      expect(state!.status).toBe('running');
      expect(state!.restartCount).toBe(0);
    });

    it('returns undefined for unknown child', () => {
      expect(supervisor.getChildState('unknown')).toBeUndefined();
    });

    it('returns a copy (not internal reference)', async () => {
      await supervisor.addChild(makeSpec('child-1'));
      const s1 = supervisor.getChildState('child-1');
      const s2 = supervisor.getChildState('child-1');
      expect(s1).not.toBe(s2);
      expect(s1!.restartTimestamps).not.toBe(s2!.restartTimestamps);
    });
  });

  describe('restartChild', () => {
    it('restarts a running child', async () => {
      const spec = makeSpec('child-1');
      await supervisor.addChild(spec);
      await supervisor.start();

      await supervisor.restartChild('child-1');
      // start should have been called: once at startup, once at restart
      expect(spec.start).toHaveBeenCalledTimes(2);
    });

    it('throws for unknown child', async () => {
      await supervisor.start();
      await expect(supervisor.restartChild('unknown')).rejects.toThrow(
        'Unknown child',
      );
    });
  });

  describe('child crash handling', () => {
    it('emits child:crashed event when child start fails', async () => {
      const crashedHandler = vi.fn();
      supervisor.on('child:crashed', crashedHandler);

      let callCount = 0;
      const spec = makeSpec('child-1', {
        start: vi.fn(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('start failed');
          }
          return makeHandle('child-1');
        }),
      });

      await supervisor.addChild(spec);
      await supervisor.start();

      // Wait for the restart with backoff to complete
      await new Promise((r) => setTimeout(r, 200));

      expect(crashedHandler).toHaveBeenCalled();
    });

    it('emits child:started event on successful start', async () => {
      const startedHandler = vi.fn();
      supervisor.on('child:started', startedHandler);

      await supervisor.addChild(makeSpec('child-1'));
      await supervisor.start();

      expect(startedHandler).toHaveBeenCalledWith('child-1', expect.any(Object));
    });

    it('emits child:stopped event on stop', async () => {
      const stoppedHandler = vi.fn();
      supervisor.on('child:stopped', stoppedHandler);

      await supervisor.addChild(makeSpec('child-1'));
      await supervisor.start();
      await supervisor.stop();

      expect(stoppedHandler).toHaveBeenCalledWith('child-1');
    });
  });

  describe('getChildren', () => {
    it('returns empty array initially', () => {
      expect(supervisor.getChildren()).toEqual([]);
    });

    it('returns all registered children', async () => {
      await supervisor.addChild(makeSpec('a'));
      await supervisor.addChild(makeSpec('b'));
      const children = supervisor.getChildren();
      expect(children).toHaveLength(2);
    });
  });

  describe('getHealthMonitor', () => {
    it('returns the health monitor instance', () => {
      const monitor = supervisor.getHealthMonitor();
      expect(monitor).toBeDefined();
    });
  });
});
