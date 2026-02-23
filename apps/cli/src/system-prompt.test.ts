/**
 * Tests for the shared buildSystemPrompt utility.
 *
 * These tests verify that the model always receives accurate capability hints
 * about memory, web search, and skills — regardless of whether it's invoked
 * from the CLI agent or the gateway.
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './system-prompt.js';

describe('buildSystemPrompt', () => {
  describe('base prompt', () => {
    it('includes ch4p identity', () => {
      const p = buildSystemPrompt();
      expect(p).toContain('You are ch4p');
    });

    it('includes autonomy level reference', () => {
      const p = buildSystemPrompt();
      expect(p).toContain('autonomy level');
    });

    it('includes security-conscious mention', () => {
      const p = buildSystemPrompt();
      expect(p).toContain('security-conscious');
    });
  });

  describe('memory capability hint', () => {
    it('is absent when hasMemory is false', () => {
      const p = buildSystemPrompt({ hasMemory: false });
      expect(p).not.toContain('persistent memory');
      expect(p).not.toContain('memory_store');
      expect(p).not.toContain('memory_recall');
    });

    it('is absent when hasMemory is not provided', () => {
      const p = buildSystemPrompt();
      expect(p).not.toContain('persistent memory');
    });

    it('is present when hasMemory is true', () => {
      const p = buildSystemPrompt({ hasMemory: true });
      expect(p).toContain('persistent memory');
    });

    it('mentions both memory tools by name', () => {
      const p = buildSystemPrompt({ hasMemory: true });
      expect(p).toContain('memory_store');
      expect(p).toContain('memory_recall');
    });

    it('tells the model to use memory tools explicitly', () => {
      const p = buildSystemPrompt({ hasMemory: true });
      expect(p).toContain('recall information from previous conversations');
    });
  });

  describe('web search capability hint', () => {
    it('is absent when hasSearch is false', () => {
      const p = buildSystemPrompt({ hasSearch: false });
      expect(p).not.toContain('web search');
      expect(p).not.toContain('web_search');
    });

    it('is absent when hasSearch is not provided', () => {
      const p = buildSystemPrompt();
      expect(p).not.toContain('web_search');
    });

    it('is present when hasSearch is true', () => {
      const p = buildSystemPrompt({ hasSearch: true });
      expect(p).toContain('web search capability');
    });

    it('mentions the web_search tool by name', () => {
      const p = buildSystemPrompt({ hasSearch: true });
      expect(p).toContain('web_search');
    });
  });

  describe('skill registry hint', () => {
    it('is absent when no skill registry provided', () => {
      const p = buildSystemPrompt();
      expect(p).not.toContain('Available skills');
    });

    it('is absent when skill registry is empty', () => {
      const fakeRegistry = { size: 0, getDescriptions: () => [] } as unknown as import('@ch4p/skills').SkillRegistry;
      const p = buildSystemPrompt({ skillRegistry: fakeRegistry });
      expect(p).not.toContain('Available skills');
    });

    it('includes skill names and descriptions when skills are present', () => {
      const fakeRegistry = {
        size: 2,
        getDescriptions: () => [
          { name: 'code-review', description: 'Review code for issues' },
          { name: 'summarize', description: 'Summarize long documents' },
        ],
      } as unknown as import('@ch4p/skills').SkillRegistry;

      const p = buildSystemPrompt({ skillRegistry: fakeRegistry });
      expect(p).toContain('Available skills');
      expect(p).toContain('code-review');
      expect(p).toContain('Review code for issues');
      expect(p).toContain('summarize');
      expect(p).toContain('load_skill');
    });
  });

  describe('combined capabilities', () => {
    it('includes all hints when all features are enabled', () => {
      const fakeRegistry = {
        size: 1,
        getDescriptions: () => [{ name: 'test-skill', description: 'A test skill' }],
      } as unknown as import('@ch4p/skills').SkillRegistry;

      const p = buildSystemPrompt({ hasMemory: true, hasSearch: true, skillRegistry: fakeRegistry });

      expect(p).toContain('persistent memory');
      expect(p).toContain('web search capability');
      expect(p).toContain('Available skills');
      expect(p).toContain('test-skill');
    });

    it('omits all hints when no features are enabled', () => {
      const p = buildSystemPrompt({ hasMemory: false, hasSearch: false });
      expect(p).not.toContain('persistent memory');
      expect(p).not.toContain('web search');
      expect(p).not.toContain('Available skills');
    });
  });
});
