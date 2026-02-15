/**
 * ITunnelProvider — tunnel/exposure contract
 *
 * Exposes the local gateway to the internet for webhook-based channels
 * (Telegram, Slack, etc.) Supports Tailscale, Cloudflare, ngrok, etc.
 */

export interface TunnelConfig {
  port: number;
  subdomain?: string;
  authToken?: string;
  [key: string]: unknown;
}

export interface TunnelInfo {
  publicUrl: string;
  provider: string;
  startedAt: Date;
}

export interface ITunnelProvider {
  readonly id: string;

  start(config: TunnelConfig): Promise<TunnelInfo>;
  stop(): Promise<void>;
  isActive(): boolean;
  getPublicUrl(): string | null;
}
