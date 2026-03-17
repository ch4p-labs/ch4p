import { describe, it, expect } from 'vitest';
import { getEnginesData, MODELS, CHANNEL_DEFS, AUTONOMY_LEVELS } from './engines.js';

describe('getEnginesData', () => {
  it('returns engines, models, channels, and autonomy levels', () => {
    const data = getEnginesData();
    expect(data.engines).toBeDefined();
    expect(data.models).toBeDefined();
    expect(data.channels).toBeDefined();
    expect(data.autonomyLevels).toBeDefined();
  });

  it('always includes Claude CLI and Codex CLI as engine options', () => {
    const data = getEnginesData();
    const ids = data.engines.map(e => e.id);
    expect(ids).toContain('claude-cli');
    expect(ids).toContain('codex-cli');
  });

  it('engines have required fields', () => {
    const data = getEnginesData();
    for (const engine of data.engines) {
      expect(typeof engine.id).toBe('string');
      expect(typeof engine.label).toBe('string');
      expect(typeof engine.description).toBe('string');
      expect(typeof engine.detected).toBe('boolean');
    }
  });
});

describe('MODELS', () => {
  it('has models for anthropic, openai, and ollama', () => {
    const providers = new Set(MODELS.map(m => m.provider));
    expect(providers.has('anthropic')).toBe(true);
    expect(providers.has('openai')).toBe(true);
    expect(providers.has('ollama')).toBe(true);
  });

  it('includes current-gen Anthropic models', () => {
    const ids = MODELS.map(m => m.id);
    expect(ids).toContain('claude-opus-4-6');
    expect(ids).toContain('claude-sonnet-4-6');
    expect(ids).toContain('claude-haiku-4-5-20251001');
  });

  it('includes current-gen OpenAI models', () => {
    const ids = MODELS.map(m => m.id);
    expect(ids).toContain('gpt-4.1');
    expect(ids).toContain('gpt-4.1-mini');
    expect(ids).toContain('o3');
    expect(ids).toContain('o4-mini');
  });

  it('each model has required fields', () => {
    for (const model of MODELS) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.label).toBe('string');
      expect(typeof model.provider).toBe('string');
    }
  });

  it('first anthropic model is recommended', () => {
    const first = MODELS.find(m => m.provider === 'anthropic');
    expect(first?.label).toContain('recommended');
  });
});

describe('CHANNEL_DEFS', () => {
  it('has at least 10 channels', () => {
    expect(CHANNEL_DEFS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes core channels', () => {
    const ids = CHANNEL_DEFS.map(c => c.id);
    expect(ids).toContain('telegram');
    expect(ids).toContain('discord');
    expect(ids).toContain('slack');
    expect(ids).toContain('matrix');
  });

  it('each channel has id, label, and fields array', () => {
    for (const ch of CHANNEL_DEFS) {
      expect(typeof ch.id).toBe('string');
      expect(typeof ch.label).toBe('string');
      expect(Array.isArray(ch.fields)).toBe(true);
    }
  });

  it('secret fields are marked', () => {
    const telegram = CHANNEL_DEFS.find(c => c.id === 'telegram');
    expect(telegram?.fields[0]?.secret).toBe(true);
  });
});

describe('AUTONOMY_LEVELS', () => {
  it('has readonly, supervised, and full', () => {
    const ids = AUTONOMY_LEVELS.map(l => l.id);
    expect(ids).toContain('readonly');
    expect(ids).toContain('supervised');
    expect(ids).toContain('full');
  });

  it('each level has description', () => {
    for (const level of AUTONOMY_LEVELS) {
      expect(typeof level.description).toBe('string');
      expect(level.description.length).toBeGreaterThan(0);
    }
  });
});
