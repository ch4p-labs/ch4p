import { vi } from 'vitest';
import { EngineRegistry } from './registry.js';
import type { IEngine } from '@ch4p/core';

function makeMockEngine(id: string): IEngine {
  return {
    id,
    name: `Engine ${id}`,
    startRun: vi.fn(),
    resume: vi.fn(),
  } as unknown as IEngine;
}

describe('EngineRegistry', () => {
  let registry: EngineRegistry;

  beforeEach(() => {
    registry = new EngineRegistry();
  });

  describe('register', () => {
    it('registers an engine by its id', () => {
      const engine = makeMockEngine('echo');
      registry.register(engine);
      expect(registry.has('echo')).toBe(true);
    });

    it('replaces existing engine with same id', () => {
      const engine1 = makeMockEngine('echo');
      const engine2 = makeMockEngine('echo');
      registry.register(engine1);
      registry.register(engine2);

      expect(registry.get('echo')).toBe(engine2);
    });
  });

  describe('get', () => {
    it('returns the registered engine', () => {
      const engine = makeMockEngine('native');
      registry.register(engine);
      expect(registry.get('native')).toBe(engine);
    });

    it('throws EngineError for unknown engine', () => {
      expect(() => registry.get('nonexistent')).toThrow('not found');
    });

    it('includes available engines in error message', () => {
      registry.register(makeMockEngine('echo'));
      registry.register(makeMockEngine('native'));

      expect(() => registry.get('unknown')).toThrow('echo');
    });
  });

  describe('has', () => {
    it('returns true for registered engines', () => {
      registry.register(makeMockEngine('echo'));
      expect(registry.has('echo')).toBe(true);
    });

    it('returns false for unregistered engines', () => {
      expect(registry.has('echo')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns empty array when no engines are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered engine ids', () => {
      registry.register(makeMockEngine('echo'));
      registry.register(makeMockEngine('native'));
      const list = registry.list();
      expect(list).toContain('echo');
      expect(list).toContain('native');
      expect(list).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('removes all registered engines', () => {
      registry.register(makeMockEngine('echo'));
      registry.register(makeMockEngine('native'));
      registry.clear();
      expect(registry.list()).toEqual([]);
      expect(registry.has('echo')).toBe(false);
    });
  });
});
