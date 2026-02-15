/**
 * Message command -- send a message via a configured channel.
 *
 * Usage:
 *   ch4p message -c telegram "Hello, world!"
 *   ch4p message --channel discord "Check this out"
 *   ch4p message -c slack -t thread_123 "Reply in thread"
 *
 * This command sends a single outbound message through the specified
 * channel. Channels must be configured in ~/.ch4p/config.json.
 *
 * This file provides the CLI entry point and placeholder messaging.
 * Full channel integration will be available when @ch4p/channels is complete.
 */

import { loadConfig } from '../config.js';

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface MessageArgs {
  channel: string | null;
  threadId: string | null;
  text: string | null;
}

function parseMessageArgs(args: string[]): MessageArgs {
  let channel: string | null = null;
  let threadId: string | null = null;
  let text: string | null = null;
  const textParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '-c' || arg === '--channel') {
      channel = args[i + 1] ?? null;
      i++;
      continue;
    }

    if (arg === '-t' || arg === '--thread') {
      threadId = args[i + 1] ?? null;
      i++;
      continue;
    }

    // Everything else is part of the message text.
    textParts.push(arg);
  }

  if (textParts.length > 0) {
    text = textParts.join(' ');
  }

  return { channel, threadId, text };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function message(args: string[]): Promise<void> {
  const parsed = parseMessageArgs(args);

  if (!parsed.channel) {
    console.error(`\n  ${RED}Error:${RESET} Channel is required.`);
    console.error(`  ${DIM}Usage: ch4p message -c <channel> "message text"${RESET}`);
    console.error(`  ${DIM}Example: ch4p message -c telegram "Hello!"${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  if (!parsed.text) {
    console.error(`\n  ${RED}Error:${RESET} Message text is required.`);
    console.error(`  ${DIM}Usage: ch4p message -c ${parsed.channel} "message text"${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${RED}Failed to load config:${RESET} ${errMessage}`);
    console.error(`  ${DIM}Run ${CYAN}ch4p onboard${DIM} to set up ch4p.${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  // Check if the channel is configured.
  const channelConfig = config.channels[parsed.channel];
  if (!channelConfig) {
    const availableChannels = Object.keys(config.channels);
    console.error(`\n  ${RED}Error:${RESET} Channel "${parsed.channel}" is not configured.`);
    if (availableChannels.length > 0) {
      console.error(`  ${DIM}Available channels: ${availableChannels.join(', ')}${RESET}`);
    } else {
      console.error(`  ${DIM}No channels configured. Add channels to ~/.ch4p/config.json.${RESET}`);
    }
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ${CYAN}${BOLD}ch4p Message${RESET}`);
  console.log(`  ${DIM}${'='.repeat(50)}${RESET}\n`);
  console.log(`  ${BOLD}Channel${RESET}   ${parsed.channel}`);
  if (parsed.threadId) {
    console.log(`  ${BOLD}Thread${RESET}    ${parsed.threadId}`);
  }
  console.log(`  ${BOLD}Message${RESET}   ${parsed.text}`);
  console.log('');
  console.log(`  ${YELLOW}${BOLD}Not yet implemented.${RESET}`);
  console.log(`  ${DIM}Channel message sending will be available when @ch4p/channels is complete.${RESET}`);
  console.log(`  ${DIM}The message will be sent via the ${parsed.channel} channel adapter.${RESET}\n`);
}
