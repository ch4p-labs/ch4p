/**
 * Tests for tunnel provider implementations.
 *
 * These tests verify construction, configuration, and state management
 * without actually spawning tunnel processes (subprocess spawning is not
 * mocked but tunnel binaries are not available in CI).
 */

import { describe, it, expect } from 'vitest';
import { CloudflareTunnel } from './cloudflare.js';
import { TailscaleTunnel } from './tailscale.js';
import { NgrokTunnel } from './ngrok.js';
import { createTunnelProvider } from './index.js';
import type { TunnelConfig } from '@ch4p/core';

// ---------------------------------------------------------------------------
// CloudflareTunnel
// ---------------------------------------------------------------------------

describe('CloudflareTunnel', () => {
  it('has correct id', () => {
    const tunnel = new CloudflareTunnel();
    expect(tunnel.id).toBe('cloudflare');
  });

  it('starts as inactive', () => {
    const tunnel = new CloudflareTunnel();
    expect(tunnel.isActive()).toBe(false);
    expect(tunnel.getPublicUrl()).toBeNull();
  });

  it('stop is safe when not running', async () => {
    const tunnel = new CloudflareTunnel();
    await expect(tunnel.stop()).resolves.toBeUndefined();
  });

  it('throws when started twice', async () => {
    const tunnel = new CloudflareTunnel();
    // Manually set active to simulate a running tunnel.
    (tunnel as unknown as { active: boolean }).active = true;
    await expect(tunnel.start({ port: 8080 })).rejects.toThrow('already running');
  });
});

// ---------------------------------------------------------------------------
// TailscaleTunnel
// ---------------------------------------------------------------------------

describe('TailscaleTunnel', () => {
  it('has correct id', () => {
    const tunnel = new TailscaleTunnel();
    expect(tunnel.id).toBe('tailscale');
  });

  it('starts as inactive', () => {
    const tunnel = new TailscaleTunnel();
    expect(tunnel.isActive()).toBe(false);
    expect(tunnel.getPublicUrl()).toBeNull();
  });

  it('stop is safe when not running', async () => {
    const tunnel = new TailscaleTunnel();
    await expect(tunnel.stop()).resolves.toBeUndefined();
  });

  it('throws when started twice', async () => {
    const tunnel = new TailscaleTunnel();
    (tunnel as unknown as { active: boolean }).active = true;
    await expect(tunnel.start({ port: 8080 })).rejects.toThrow('already running');
  });
});

// ---------------------------------------------------------------------------
// NgrokTunnel
// ---------------------------------------------------------------------------

describe('NgrokTunnel', () => {
  it('has correct id', () => {
    const tunnel = new NgrokTunnel();
    expect(tunnel.id).toBe('ngrok');
  });

  it('starts as inactive', () => {
    const tunnel = new NgrokTunnel();
    expect(tunnel.isActive()).toBe(false);
    expect(tunnel.getPublicUrl()).toBeNull();
  });

  it('stop is safe when not running', async () => {
    const tunnel = new NgrokTunnel();
    await expect(tunnel.stop()).resolves.toBeUndefined();
  });

  it('throws when started twice', async () => {
    const tunnel = new NgrokTunnel();
    (tunnel as unknown as { active: boolean }).active = true;
    await expect(tunnel.start({ port: 8080 })).rejects.toThrow('already running');
  });
});

// ---------------------------------------------------------------------------
// createTunnelProvider factory
// ---------------------------------------------------------------------------

describe('createTunnelProvider', () => {
  it('creates cloudflare tunnel', () => {
    const tunnel = createTunnelProvider('cloudflare');
    expect(tunnel.id).toBe('cloudflare');
  });

  it('creates tailscale tunnel', () => {
    const tunnel = createTunnelProvider('tailscale');
    expect(tunnel.id).toBe('tailscale');
  });

  it('creates ngrok tunnel', () => {
    const tunnel = createTunnelProvider('ngrok');
    expect(tunnel.id).toBe('ngrok');
  });

  it('throws for unknown provider', () => {
    expect(() => createTunnelProvider('unknown')).toThrow('Unknown tunnel provider');
  });

  it('all providers implement ITunnelProvider interface', () => {
    for (const name of ['cloudflare', 'tailscale', 'ngrok']) {
      const tunnel = createTunnelProvider(name);
      expect(typeof tunnel.id).toBe('string');
      expect(typeof tunnel.start).toBe('function');
      expect(typeof tunnel.stop).toBe('function');
      expect(typeof tunnel.isActive).toBe('function');
      expect(typeof tunnel.getPublicUrl).toBe('function');
    }
  });
});
