/**
 * CliChannel -- Phase 1 primary channel
 *
 * Reads user input from stdin via Node.js readline, writes assistant
 * responses to stdout. Supports markdown-to-terminal conversion for
 * readable console output.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type {
  IChannel,
  ChannelConfig,
  Recipient,
  InboundMessage,
  OutboundMessage,
  SendResult,
  PresenceEvent,
} from '@ch4p/core';
import { generateId } from '@ch4p/core';

export class CliChannel implements IChannel {
  readonly id = 'cli';
  readonly name = 'CLI';

  private rl: ReadlineInterface | null = null;
  private messageHandler: ((msg: InboundMessage) => void) | null = null;
  private running = false;

  async start(_config: ChannelConfig): Promise<void> {
    if (this.running) return;

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line: string) => {
      const text = line.trim();
      if (!text) return;

      if (this.messageHandler) {
        const msg: InboundMessage = {
          id: generateId(),
          channelId: this.id,
          from: {
            channelId: this.id,
            userId: 'cli-user',
          },
          text,
          timestamp: new Date(),
          raw: line,
        };
        this.messageHandler(msg);
      }
    });

    this.rl.on('close', () => {
      this.running = false;
    });

    this.running = true;
  }

  async stop(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.running = false;
  }

  async send(_to: Recipient, message: OutboundMessage): Promise<SendResult> {
    try {
      const output = this.formatOutput(message);
      process.stdout.write(output + '\n');
      return {
        success: true,
        messageId: generateId(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.messageHandler = handler;
  }

  onPresence(_handler: (event: PresenceEvent) => void): void {
    // CLI channel does not emit presence events.
  }

  async isHealthy(): Promise<boolean> {
    return this.running;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Format an outbound message for terminal display.
   * When the format is markdown, strip or convert common markdown syntax
   * to terminal-friendly plain text.
   */
  private formatOutput(message: OutboundMessage): string {
    if (message.format === 'markdown') {
      return this.markdownToTerminal(message.text);
    }
    if (message.format === 'html') {
      return this.stripHtml(message.text);
    }
    return message.text;
  }

  /**
   * Lightweight markdown-to-terminal conversion.
   * Handles headers, bold, italic, code blocks, inline code, links, and
   * horizontal rules without pulling in any external dependency.
   */
  private markdownToTerminal(md: string): string {
    let text = md;

    // Code blocks: remove fences, indent content
    text = text.replace(/```[\s\S]*?\n([\s\S]*?)```/g, (_match, code: string) => {
      return code
        .split('\n')
        .map((line: string) => `  ${line}`)
        .join('\n');
    });

    // Headers: uppercase + underline-style emphasis
    text = text.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading: string) => {
      return `\n${heading.toUpperCase()}\n${'='.repeat(heading.length)}`;
    });

    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '$1');
    text = text.replace(/__(.+?)__/g, '$1');

    // Italic: *text* or _text_ (single)
    text = text.replace(/\*(.+?)\*/g, '$1');
    text = text.replace(/_(.+?)_/g, '$1');

    // Inline code
    text = text.replace(/`([^`]+)`/g, '$1');

    // Links: [text](url) -> text (url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // Horizontal rules
    text = text.replace(/^[-*_]{3,}$/gm, '---');

    // Unordered list markers
    text = text.replace(/^\s*[-*+]\s+/gm, '  - ');

    return text.trim();
  }

  /** Strip HTML tags, returning plain text. */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
