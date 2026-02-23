/**
 * AgentRouter unit tests.
 *
 * Verifies config-driven routing rule evaluation:
 *   - Default fallback when no rules are configured
 *   - Channel-based routing
 *   - Text pattern (regex) matching
 *   - Combined channel + pattern matching
 *   - First-rule-wins ordering
 *   - Missing agent name in rule (graceful skip)
 *   - Wildcard channel matching
 *   - Agent config properties applied to the decision
 *   - Context isolation: different channel IDs don't cross-match
 */

import { describe, it, expect } from 'vitest';
import { AgentRouter } from './agent-router.js';
import type { Ch4pConfig, InboundMessage } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(routing?: Ch4pConfig['routing']): Ch4pConfig {
  return {
    agent: { model: 'claude-sonnet-4-6', provider: 'anthropic' },
    providers: {},
    channels: {},
    memory: { backend: 'sqlite', autoSave: false },
    gateway: { port: 18789, requirePairing: false, allowPublicBind: false },
    security: { workspaceOnly: true, blockedPaths: [] },
    autonomy: { level: 'supervised', allowedCommands: [] },
    engines: { default: 'native', available: {} },
    tunnel: { provider: 'none' },
    secrets: { encrypt: false },
    observability: { observers: [], logLevel: 'info' },
    skills: { enabled: false, paths: [], autoLoad: false, contextBudget: 0 },
    routing,
  } as Ch4pConfig;
}

function makeMsg(channelId: string, text: string): InboundMessage {
  return {
    id: 'test-id',
    channelId,
    from: { channelId, userId: 'user1' },
    text,
    timestamp: new Date(),
  };
}

const DEFAULT_PROMPT = 'default system prompt';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentRouter', () => {
  // ---- Default behaviour ----

  it('returns "default" decision when no routing config is present', () => {
    const router = new AgentRouter(makeConfig());
    const decision = router.route(makeMsg('telegram', 'hello'), DEFAULT_PROMPT);

    expect(decision.agentName).toBe('default');
    expect(decision.systemPrompt).toBe(DEFAULT_PROMPT);
    expect(decision.model).toBeUndefined();
    expect(decision.provider).toBeUndefined();
    expect(decision.maxIterations).toBe(20);
    expect(decision.toolExclude).toEqual([]);
  });

  it('returns "default" decision when routing.rules is empty', () => {
    const router = new AgentRouter(makeConfig({ agents: {}, rules: [] }));
    const decision = router.route(makeMsg('telegram', 'hello'), DEFAULT_PROMPT);
    expect(decision.agentName).toBe('default');
  });

  it('hasRules returns false when no rules', () => {
    expect(new AgentRouter(makeConfig()).hasRules()).toBe(false);
    expect(new AgentRouter(makeConfig({ rules: [], agents: {} })).hasRules()).toBe(false);
  });

  it('hasRules returns true when rules exist', () => {
    const config = makeConfig({
      agents: { fast: { model: 'haiku' } },
      rules: [{ agent: 'fast' }],
    });
    expect(new AgentRouter(config).hasRules()).toBe(true);
  });

  it('agentNames returns defined agent names', () => {
    const config = makeConfig({
      agents: { fast: {}, deep: {} },
      rules: [],
    });
    const names = new AgentRouter(config).agentNames();
    expect(names).toContain('fast');
    expect(names).toContain('deep');
    expect(names).toHaveLength(2);
  });

  // ---- Channel routing ----

  it('routes to named agent by channel ID', () => {
    const config = makeConfig({
      agents: { coding: { model: 'claude-opus-4-5', maxIterations: 50 } },
      rules: [{ channel: 'telegram', agent: 'coding' }],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('telegram', 'any message'), DEFAULT_PROMPT);

    expect(decision.agentName).toBe('coding');
    expect(decision.model).toBe('claude-opus-4-5');
    expect(decision.maxIterations).toBe(50);
  });

  it('does not route when channel ID does not match', () => {
    const config = makeConfig({
      agents: { coding: { model: 'opus' } },
      rules: [{ channel: 'telegram', agent: 'coding' }],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('discord', 'hello'), DEFAULT_PROMPT);
    expect(decision.agentName).toBe('default');
  });

  // ---- Text pattern routing ----

  it('routes to named agent when text matches pattern', () => {
    const config = makeConfig({
      agents: { coder: { model: 'claude-opus-4-5' } },
      rules: [{ match: 'code|debug|fix', agent: 'coder' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('any', 'please debug this'), DEFAULT_PROMPT).agentName).toBe('coder');
    expect(router.route(makeMsg('any', 'fix the bug'), DEFAULT_PROMPT).agentName).toBe('coder');
    expect(router.route(makeMsg('any', 'write code'), DEFAULT_PROMPT).agentName).toBe('coder');
  });

  it('does not route when text pattern does not match', () => {
    const config = makeConfig({
      agents: { coder: {} },
      rules: [{ match: 'code|debug', agent: 'coder' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('any', 'hello world'), DEFAULT_PROMPT).agentName).toBe('default');
  });

  it('text matching is case-insensitive', () => {
    const config = makeConfig({
      agents: { coder: {} },
      rules: [{ match: 'code', agent: 'coder' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('any', 'Write CODE please'), DEFAULT_PROMPT).agentName).toBe('coder');
    expect(router.route(makeMsg('any', 'Code review needed'), DEFAULT_PROMPT).agentName).toBe('coder');
  });

  // ---- Combined channel + text routing ----

  it('routes when both channel and text match', () => {
    const config = makeConfig({
      agents: { specialist: { model: 'sonnet' } },
      rules: [{ channel: 'discord', match: 'deploy|release', agent: 'specialist' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('discord', 'deploy the app'), DEFAULT_PROMPT).agentName).toBe('specialist');
  });

  it('does not route when channel matches but text does not', () => {
    const config = makeConfig({
      agents: { specialist: {} },
      rules: [{ channel: 'discord', match: 'deploy', agent: 'specialist' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('discord', 'hello world'), DEFAULT_PROMPT).agentName).toBe('default');
  });

  it('does not route when text matches but channel does not', () => {
    const config = makeConfig({
      agents: { specialist: {} },
      rules: [{ channel: 'discord', match: 'deploy', agent: 'specialist' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('telegram', 'deploy the app'), DEFAULT_PROMPT).agentName).toBe('default');
  });

  // ---- Wildcard channel ----

  it('omitting channel matches any channel', () => {
    const config = makeConfig({
      agents: { quick: { model: 'haiku', maxIterations: 5 } },
      rules: [{ match: 'hello|hi', agent: 'quick' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('telegram', 'hi there'), DEFAULT_PROMPT).agentName).toBe('quick');
    expect(router.route(makeMsg('discord', 'hello!'), DEFAULT_PROMPT).agentName).toBe('quick');
    expect(router.route(makeMsg('slack', 'hi'), DEFAULT_PROMPT).agentName).toBe('quick');
  });

  it('explicit "*" channel matches any channel', () => {
    const config = makeConfig({
      agents: { quick: {} },
      rules: [{ channel: '*', match: 'hi', agent: 'quick' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('telegram', 'hi'), DEFAULT_PROMPT).agentName).toBe('quick');
    expect(router.route(makeMsg('discord', 'hi'), DEFAULT_PROMPT).agentName).toBe('quick');
  });

  // ---- First-rule-wins ordering ----

  it('first matching rule wins', () => {
    const config = makeConfig({
      agents: {
        first: { model: 'model-a' },
        second: { model: 'model-b' },
      },
      rules: [
        { match: 'urgent', agent: 'first' },
        { match: 'urgent|important', agent: 'second' },
      ],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('any', 'urgent request'), DEFAULT_PROMPT);
    expect(decision.agentName).toBe('first');
    expect(decision.model).toBe('model-a');
  });

  it('falls through to second rule when first does not match', () => {
    const config = makeConfig({
      agents: {
        coder: { model: 'opus' },
        quick: { model: 'haiku' },
      },
      rules: [
        { match: 'code|debug', agent: 'coder' },
        { agent: 'quick' },  // catch-all last rule (no channel/match)
      ],
    });
    const router = new AgentRouter(config);

    // Non-code message hits catch-all.
    expect(router.route(makeMsg('any', 'what is 2+2?'), DEFAULT_PROMPT).agentName).toBe('quick');
    // Code message hits first rule.
    expect(router.route(makeMsg('any', 'debug this loop'), DEFAULT_PROMPT).agentName).toBe('coder');
  });

  // ---- Missing agent in agents map ----

  it('skips rule when agent name is not in agents map', () => {
    const config = makeConfig({
      agents: {},  // no agents defined
      rules: [{ agent: 'nonexistent' }, { agent: 'also-missing' }],
    });
    const router = new AgentRouter(config);

    // All rules reference missing agents → falls back to default.
    const decision = router.route(makeMsg('any', 'hello'), DEFAULT_PROMPT);
    expect(decision.agentName).toBe('default');
  });

  // ---- Agent config fields in decision ----

  it('applies agent systemPrompt override', () => {
    const config = makeConfig({
      agents: {
        expert: { systemPrompt: 'You are an expert engineer.' },
      },
      rules: [{ agent: 'expert' }],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('any', 'help me'), DEFAULT_PROMPT);
    expect(decision.systemPrompt).toBe('You are an expert engineer.');
  });

  it('falls back to defaultSystemPrompt when agent has no systemPrompt', () => {
    const config = makeConfig({
      agents: { fast: { model: 'haiku' } },
      rules: [{ agent: 'fast' }],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('any', 'hello'), DEFAULT_PROMPT);
    expect(decision.systemPrompt).toBe(DEFAULT_PROMPT);
  });

  it('applies toolExclude from agent config', () => {
    const config = makeConfig({
      agents: { readonly: { toolExclude: ['bash', 'file_write'] } },
      rules: [{ agent: 'readonly' }],
    });
    const router = new AgentRouter(config);

    const decision = router.route(makeMsg('any', 'help'), DEFAULT_PROMPT);
    expect(decision.toolExclude).toContain('bash');
    expect(decision.toolExclude).toContain('file_write');
  });

  it('defaults to empty toolExclude when not specified', () => {
    const config = makeConfig({
      agents: { basic: {} },
      rules: [{ agent: 'basic' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('any', 'hi'), DEFAULT_PROMPT).toolExclude).toEqual([]);
  });

  it('defaults maxIterations to 20 when not specified', () => {
    const config = makeConfig({
      agents: { basic: { model: 'sonnet' } },
      rules: [{ agent: 'basic' }],
    });
    const router = new AgentRouter(config);

    expect(router.route(makeMsg('any', 'hi'), DEFAULT_PROMPT).maxIterations).toBe(20);
  });

  // ---- routeToAgent direct lookup ----

  it('routeToAgent returns named agent decision', () => {
    const config = makeConfig({
      agents: { deep: { model: 'opus', maxIterations: 40 } },
      rules: [],
    });
    const router = new AgentRouter(config);

    const decision = router.routeToAgent('deep', DEFAULT_PROMPT);
    expect(decision.agentName).toBe('deep');
    expect(decision.model).toBe('opus');
    expect(decision.maxIterations).toBe(40);
  });

  it('routeToAgent returns default decision for unknown agent', () => {
    const router = new AgentRouter(makeConfig());
    const decision = router.routeToAgent('nonexistent', DEFAULT_PROMPT);
    expect(decision.agentName).toBe('default');
  });

  // ---- Edge cases ----

  it('handles missing text in inbound message (no crash)', () => {
    const config = makeConfig({
      agents: { a: {} },
      rules: [{ match: 'hello', agent: 'a' }],
    });
    const router = new AgentRouter(config);
    const msg: InboundMessage = {
      id: 'x',
      channelId: 'test',
      from: { channelId: 'test', userId: 'u' },
      timestamp: new Date(),
      // No text field.
    };
    // Should not throw — empty text just won't match the pattern.
    expect(() => router.route(msg, DEFAULT_PROMPT)).not.toThrow();
    expect(router.route(msg, DEFAULT_PROMPT).agentName).toBe('default');
  });

  it('handles missing channelId in inbound message (no crash)', () => {
    const config = makeConfig({
      agents: { a: {} },
      rules: [{ channel: 'telegram', agent: 'a' }],
    });
    const router = new AgentRouter(config);
    const msg: InboundMessage = {
      id: 'x',
      from: { channelId: 'telegram', userId: 'u' },
      text: 'hi',
      timestamp: new Date(),
      // No channelId at top level.
    };
    expect(() => router.route(msg, DEFAULT_PROMPT)).not.toThrow();
  });
});
