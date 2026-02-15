/**
 * ngrok Tunnel provider — exposes local gateway via ngrok tunnels.
 *
 * Uses the `ngrok` CLI binary to create HTTP tunnels. Supports both
 * free tier (random subdomain) and paid tier (custom subdomain).
 *
 * Command: `ngrok http {port}` (with optional --authtoken and --subdomain)
 *
 * The public URL is extracted from ngrok's local API at http://127.0.0.1:4040/api/tunnels.
 *
 * Zero external dependencies — uses Node.js child_process and fetch() only.
 */

import type { ITunnelProvider, TunnelConfig, TunnelInfo } from '@ch4p/core';
import { spawn, type ChildProcess } from 'node:child_process';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NgrokTunnelConfig extends TunnelConfig {
  /** ngrok auth token. If not provided, uses the token from ngrok config. */
  authToken?: string;
  /** Custom subdomain (requires paid ngrok plan). */
  subdomain?: string;
  /** ngrok region. Default: auto. */
  region?: string;
  /** Path to ngrok binary. Default: 'ngrok'. */
  binaryPath?: string;
  /** ngrok local API URL. Default: 'http://127.0.0.1:4040'. */
  apiUrl?: string;
}

// ---------------------------------------------------------------------------
// NgrokTunnel
// ---------------------------------------------------------------------------

export class NgrokTunnel implements ITunnelProvider {
  readonly id = 'ngrok';

  private process: ChildProcess | null = null;
  private publicUrl: string | null = null;
  private active = false;
  private startedAt: Date | null = null;

  // -----------------------------------------------------------------------
  // ITunnelProvider implementation
  // -----------------------------------------------------------------------

  async start(config: TunnelConfig): Promise<TunnelInfo> {
    if (this.active) {
      throw new Error('ngrok tunnel is already running');
    }

    const cfg = config as NgrokTunnelConfig;
    const binaryPath = cfg.binaryPath ?? 'ngrok';
    const apiUrl = cfg.apiUrl ?? 'http://127.0.0.1:4040';

    const args: string[] = ['http', String(config.port)];

    if (cfg.authToken) {
      args.push('--authtoken', cfg.authToken);
    }

    if (cfg.subdomain) {
      args.push('--subdomain', cfg.subdomain);
    }

    if (cfg.region) {
      args.push('--region', cfg.region);
    }

    // ngrok outputs a TUI to stdout. We run it and poll the local API
    // to get the public URL.
    const child = spawn(binaryPath, args, {
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    this.process = child;

    child.on('error', () => {
      this.active = false;
    });

    child.on('close', () => {
      this.active = false;
    });

    // Wait for ngrok to start and then query its local API.
    const url = await this.waitForTunnel(apiUrl, 15_000);

    if (!url) {
      this.stop();
      throw new Error('Could not retrieve ngrok public URL from local API');
    }

    this.publicUrl = url;
    this.active = true;
    this.startedAt = new Date();

    return {
      publicUrl: this.publicUrl,
      provider: this.id,
      startedAt: this.startedAt,
    };
  }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
    this.process = null;
    this.publicUrl = null;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  // -----------------------------------------------------------------------
  // Private: poll ngrok local API
  // -----------------------------------------------------------------------

  /**
   * Poll the ngrok local API to get the public tunnel URL.
   * ngrok exposes tunnel info at http://127.0.0.1:4040/api/tunnels.
   */
  private async waitForTunnel(
    apiUrl: string,
    timeoutMs: number,
  ): Promise<string | null> {
    const start = Date.now();
    const pollInterval = 500;

    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`${apiUrl}/api/tunnels`);
        if (response.ok) {
          const data = (await response.json()) as {
            tunnels: Array<{
              name: string;
              public_url: string;
              proto: string;
            }>;
          };

          // Prefer HTTPS tunnel.
          const httpsTunnel = data.tunnels.find((t) => t.proto === 'https');
          const anyTunnel = data.tunnels[0];
          const tunnel = httpsTunnel ?? anyTunnel;

          if (tunnel?.public_url) {
            return tunnel.public_url;
          }
        }
      } catch {
        // ngrok API not ready yet — keep polling.
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return null;
  }
}
