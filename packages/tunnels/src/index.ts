/**
 * @ch4p/tunnels — tunnel provider implementations for exposing
 * the local gateway to the internet.
 *
 * Supports Cloudflare Tunnels, Tailscale Funnel, and ngrok.
 * All providers implement the ITunnelProvider interface from @ch4p/core.
 */

export { CloudflareTunnel } from './cloudflare.js';
export type { CloudflareTunnelConfig } from './cloudflare.js';

export { TailscaleTunnel } from './tailscale.js';
export type { TailscaleTunnelConfig } from './tailscale.js';

export { NgrokTunnel } from './ngrok.js';
export type { NgrokTunnelConfig } from './ngrok.js';

// Re-export tunnel types from core for convenience
export type { ITunnelProvider, TunnelConfig, TunnelInfo } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

import type { ITunnelProvider } from '@ch4p/core';
import { CloudflareTunnel } from './cloudflare.js';
import { TailscaleTunnel } from './tailscale.js';
import { NgrokTunnel } from './ngrok.js';

/**
 * Create a tunnel provider instance by name.
 * Throws if the provider name is unknown.
 */
export function createTunnelProvider(name: string): ITunnelProvider {
  switch (name) {
    case 'cloudflare':
      return new CloudflareTunnel();
    case 'tailscale':
      return new TailscaleTunnel();
    case 'ngrok':
      return new NgrokTunnel();
    default:
      throw new Error(`Unknown tunnel provider: "${name}". Supported: cloudflare, tailscale, ngrok`);
  }
}
