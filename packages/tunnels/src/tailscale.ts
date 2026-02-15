/**
 * Tailscale Funnel provider — exposes local gateway via Tailscale Funnel.
 *
 * Uses the `tailscale` CLI to set up a Funnel that exposes a local port
 * to the internet via the user's Tailscale network.
 *
 * Requires: tailscale installed, user authenticated, and Funnel enabled
 * on the tailnet (admin panel → DNS → Enable HTTPS, Enable Funnel).
 *
 * Command: `tailscale funnel {port}`
 *
 * Zero external dependencies — uses Node.js child_process only.
 */

import type { ITunnelProvider, TunnelConfig, TunnelInfo } from '@ch4p/core';
import { spawn, execSync, type ChildProcess } from 'node:child_process';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TailscaleTunnelConfig extends TunnelConfig {
  /** Path to tailscale binary. Default: 'tailscale'. */
  binaryPath?: string;
  /** Whether to use HTTPS. Default: true. */
  https?: boolean;
  /** Background mode — keep funnel running after ch4p exits. Default: false. */
  background?: boolean;
}

// ---------------------------------------------------------------------------
// TailscaleTunnel
// ---------------------------------------------------------------------------

export class TailscaleTunnel implements ITunnelProvider {
  readonly id = 'tailscale';

  private process: ChildProcess | null = null;
  private publicUrl: string | null = null;
  private active = false;
  private startedAt: Date | null = null;

  // -----------------------------------------------------------------------
  // ITunnelProvider implementation
  // -----------------------------------------------------------------------

  async start(config: TunnelConfig): Promise<TunnelInfo> {
    if (this.active) {
      throw new Error('Tailscale tunnel is already running');
    }

    const cfg = config as TailscaleTunnelConfig;
    const binaryPath = cfg.binaryPath ?? 'tailscale';

    // Get the machine's Tailscale hostname.
    const hostname = this.getTailscaleHostname(binaryPath);
    if (!hostname) {
      throw new Error('Could not determine Tailscale hostname. Is Tailscale running?');
    }

    this.publicUrl = `https://${hostname}:${config.port}`;

    const args: string[] = ['funnel', String(config.port)];

    if (cfg.background) {
      args.push('--bg');
    }

    return new Promise<TunnelInfo>((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;
      let resolved = false;
      let output = '';

      const handler = (data: Buffer) => {
        const text = data.toString();
        output += text;

        // Tailscale funnel outputs confirmation messages.
        if ((text.includes('Funnel started') || text.includes('https://') || text.includes('Available on the internet')) && !resolved) {
          resolved = true;
          this.active = true;
          this.startedAt = new Date();

          // Try to extract the URL from output.
          const urlMatch = text.match(/(https:\/\/[^\s]+)/);
          if (urlMatch) {
            this.publicUrl = urlMatch[1]!;
          }

          resolve({
            publicUrl: this.publicUrl!,
            provider: this.id,
            startedAt: this.startedAt,
          });
        }
      };

      child.stdout?.on('data', handler);
      child.stderr?.on('data', handler);

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to start tailscale funnel: ${err.message}`));
        }
      });

      child.on('close', (code) => {
        this.active = false;

        // Background mode exits immediately with code 0.
        if (cfg.background && code === 0 && !resolved) {
          resolved = true;
          this.active = true;
          this.startedAt = new Date();
          resolve({
            publicUrl: this.publicUrl!,
            provider: this.id,
            startedAt: this.startedAt,
          });
          return;
        }

        if (!resolved) {
          resolved = true;
          reject(new Error(
            `tailscale funnel exited with code ${code}${output ? ': ' + output.slice(0, 500) : ''}`,
          ));
        }
      });

      // Timeout after 15 seconds.
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.active = true;
          this.startedAt = new Date();
          // Assume it started — Tailscale may not print a clear success message.
          resolve({
            publicUrl: this.publicUrl!,
            provider: this.id,
            startedAt: this.startedAt,
          });
        }
      }, 15_000);
    });
  }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }

    // Also explicitly turn off the funnel.
    try {
      execSync('tailscale funnel off', { stdio: 'ignore', timeout: 5000 });
    } catch {
      // Ignore — funnel may already be off.
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
  // Private helpers
  // -----------------------------------------------------------------------

  private getTailscaleHostname(binary: string): string | null {
    try {
      const output = execSync(`${binary} status --json`, {
        timeout: 5000,
        encoding: 'utf8',
      });
      const status = JSON.parse(output) as { Self?: { DNSName?: string } };
      const dnsName = status.Self?.DNSName;
      // Remove trailing dot if present.
      return dnsName ? dnsName.replace(/\.$/, '') : null;
    } catch {
      return null;
    }
  }
}
