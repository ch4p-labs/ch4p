/**
 * Tests for AutonomyGuard -- autonomy level enforcement, action classification,
 * and confirmation requirements.
 */

import { AutonomyGuard } from './autonomy.js';
import type { ActionDescriptor, AutonomyLevel } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function action(type: string, target: string = '/test'): ActionDescriptor {
  return { type, target };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutonomyGuard', () => {
  // -----------------------------------------------------------------------
  // Constructor & getLevel
  // -----------------------------------------------------------------------

  describe('constructor & getLevel', () => {
    it('stores and returns "readonly" autonomy level', () => {
      const guard = new AutonomyGuard('readonly');
      expect(guard.getLevel()).toBe('readonly');
    });

    it('stores and returns "supervised" autonomy level', () => {
      const guard = new AutonomyGuard('supervised');
      expect(guard.getLevel()).toBe('supervised');
    });

    it('stores and returns "full" autonomy level', () => {
      const guard = new AutonomyGuard('full');
      expect(guard.getLevel()).toBe('full');
    });
  });

  // -----------------------------------------------------------------------
  // readonly level
  // -----------------------------------------------------------------------

  describe('readonly level', () => {
    let guard: AutonomyGuard;

    beforeEach(() => {
      guard = new AutonomyGuard('readonly');
    });

    describe('read actions - auto-approved', () => {
      const readTypes = ['read', 'list', 'get', 'view', 'search', 'query', 'inspect', 'stat', 'ls', 'cat', 'head', 'tail', 'find', 'grep'];

      for (const type of readTypes) {
        it(`auto-approves "${type}" action`, () => {
          expect(guard.requiresConfirmation(action(type))).toBe(false);
        });
      }
    });

    describe('write actions - require confirmation', () => {
      const writeTypes = ['write', 'create', 'update', 'delete', 'modify', 'rename'];

      for (const type of writeTypes) {
        it(`requires confirmation for "${type}" action`, () => {
          expect(guard.requiresConfirmation(action(type))).toBe(true);
        });
      }
    });

    describe('execute actions - require confirmation', () => {
      const execTypes = ['execute', 'run', 'exec', 'spawn', 'shell', 'command', 'script', 'invoke'];

      for (const type of execTypes) {
        it(`requires confirmation for "${type}" action`, () => {
          expect(guard.requiresConfirmation(action(type))).toBe(true);
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // supervised level
  // -----------------------------------------------------------------------

  describe('supervised level', () => {
    let guard: AutonomyGuard;

    beforeEach(() => {
      guard = new AutonomyGuard('supervised');
    });

    describe('read actions - auto-approved', () => {
      it('auto-approves read action', () => {
        expect(guard.requiresConfirmation(action('read'))).toBe(false);
      });

      it('auto-approves list action', () => {
        expect(guard.requiresConfirmation(action('list'))).toBe(false);
      });
    });

    describe('write actions - auto-approved', () => {
      it('auto-approves write action', () => {
        expect(guard.requiresConfirmation(action('write'))).toBe(false);
      });

      it('auto-approves create action (classified as write)', () => {
        expect(guard.requiresConfirmation(action('create'))).toBe(false);
      });

      it('auto-approves delete action (classified as write)', () => {
        expect(guard.requiresConfirmation(action('delete'))).toBe(false);
      });

      it('auto-approves unknown action types (classified as write)', () => {
        expect(guard.requiresConfirmation(action('something_unknown'))).toBe(false);
      });
    });

    describe('execute actions - require confirmation', () => {
      const execTypes = ['execute', 'run', 'exec', 'spawn', 'shell', 'command', 'script', 'invoke'];

      for (const type of execTypes) {
        it(`requires confirmation for "${type}" action`, () => {
          expect(guard.requiresConfirmation(action(type))).toBe(true);
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // full level
  // -----------------------------------------------------------------------

  describe('full level', () => {
    let guard: AutonomyGuard;

    beforeEach(() => {
      guard = new AutonomyGuard('full');
    });

    it('auto-approves read actions', () => {
      expect(guard.requiresConfirmation(action('read'))).toBe(false);
    });

    it('auto-approves write actions', () => {
      expect(guard.requiresConfirmation(action('write'))).toBe(false);
    });

    it('auto-approves execute actions', () => {
      expect(guard.requiresConfirmation(action('execute'))).toBe(false);
    });

    it('auto-approves all known action types', () => {
      const allTypes = [
        'read', 'list', 'get', 'view', 'search', 'query', 'inspect', 'stat',
        'ls', 'cat', 'head', 'tail', 'find', 'grep',
        'write', 'create', 'update', 'delete', 'modify',
        'execute', 'run', 'exec', 'spawn', 'shell', 'command', 'script', 'invoke',
      ];
      for (const type of allTypes) {
        expect(guard.requiresConfirmation(action(type))).toBe(false);
      }
    });

    it('auto-approves unknown action types', () => {
      expect(guard.requiresConfirmation(action('custom_action'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Case insensitivity
  // -----------------------------------------------------------------------

  describe('case insensitivity', () => {
    it('classifies uppercase READ as read', () => {
      const guard = new AutonomyGuard('readonly');
      expect(guard.requiresConfirmation(action('READ'))).toBe(false);
    });

    it('classifies mixed case "Execute" as execute', () => {
      const guard = new AutonomyGuard('supervised');
      expect(guard.requiresConfirmation(action('Execute'))).toBe(true);
    });

    it('classifies "LIST" as read', () => {
      const guard = new AutonomyGuard('readonly');
      expect(guard.requiresConfirmation(action('LIST'))).toBe(false);
    });

    it('classifies "SHELL" as execute', () => {
      const guard = new AutonomyGuard('supervised');
      expect(guard.requiresConfirmation(action('SHELL'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown action types default to write
  // -----------------------------------------------------------------------

  describe('unknown action types', () => {
    it('treats unknown types as write in readonly mode (requires confirmation)', () => {
      const guard = new AutonomyGuard('readonly');
      expect(guard.requiresConfirmation(action('frobnicate'))).toBe(true);
    });

    it('treats unknown types as write in supervised mode (auto-approved)', () => {
      const guard = new AutonomyGuard('supervised');
      expect(guard.requiresConfirmation(action('frobnicate'))).toBe(false);
    });

    it('treats unknown types as write in full mode (auto-approved)', () => {
      const guard = new AutonomyGuard('full');
      expect(guard.requiresConfirmation(action('frobnicate'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // ActionDescriptor with details
  // -----------------------------------------------------------------------

  describe('ActionDescriptor with details', () => {
    it('works with detailed action descriptors', () => {
      const guard = new AutonomyGuard('supervised');
      const descriptor: ActionDescriptor = {
        type: 'execute',
        target: '/usr/bin/git',
        details: { args: ['status'], cwd: '/home/user/project' },
      };
      expect(guard.requiresConfirmation(descriptor)).toBe(true);
    });

    it('ignores details when classifying action type', () => {
      const guard = new AutonomyGuard('readonly');
      const descriptor: ActionDescriptor = {
        type: 'read',
        target: '/some/file',
        details: { encoding: 'utf-8' },
      };
      expect(guard.requiresConfirmation(descriptor)).toBe(false);
    });
  });
});
