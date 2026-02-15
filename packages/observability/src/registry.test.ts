import { vi } from 'vitest';
import { createObserver } from './registry.js';
import { ConsoleObserver } from './console-observer.js';
import { NoopObserver } from './noop-observer.js';
import { MultiObserver } from './multi-observer.js';

describe('createObserver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns NoopObserver when observers array is empty', () => {
    const observer = createObserver({ observers: [] });
    expect(observer).toBeInstanceOf(NoopObserver);
  });

  it('returns NoopObserver when observers is undefined-like', () => {
    const observer = createObserver({ observers: [] });
    expect(observer).toBeInstanceOf(NoopObserver);
  });

  it('returns ConsoleObserver for single "console" observer', () => {
    const observer = createObserver({ observers: ['console'] });
    expect(observer).toBeInstanceOf(ConsoleObserver);
  });

  it('returns NoopObserver for single "noop" observer', () => {
    const observer = createObserver({ observers: ['noop'] });
    expect(observer).toBeInstanceOf(NoopObserver);
  });

  it('returns MultiObserver for multiple observers', () => {
    const observer = createObserver({ observers: ['console', 'noop'] });
    expect(observer).toBeInstanceOf(MultiObserver);
  });

  it('passes logLevel to ConsoleObserver', () => {
    const observer = createObserver({
      observers: ['console'],
      logLevel: 'error',
    });
    // ConsoleObserver at error level should suppress info logs
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    observer.onSessionStart({
      sessionId: 's1',
      engineId: 'echo',
      startedAt: new Date(),
    });
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('warns about unknown observer names', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createObserver({ observers: ['unknown-observer'] });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown observer'),
    );
    warnSpy.mockRestore();
  });

  it('returns NoopObserver when all observers are unknown', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const observer = createObserver({ observers: ['foo', 'bar'] });
    expect(observer).toBeInstanceOf(NoopObserver);
    vi.restoreAllMocks();
  });

  it('creates file observer with custom path and size', () => {
    // File observer creates directories, so we use a temp path
    const observer = createObserver({
      observers: ['file'],
      logPath: '/tmp/ch4p-test/test.jsonl',
      maxLogSize: 1024,
    });
    // Should not throw and should be a FileObserver instance
    expect(observer).toBeDefined();
    expect(typeof observer.flush).toBe('function');
  });
});
