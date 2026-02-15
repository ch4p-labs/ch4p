/**
 * Pairing command -- manage gateway pairing codes.
 *
 * Pairing is the security mechanism that ensures only authorized
 * clients can connect to the ch4p gateway. Based on ZeroClaw's
 * one-time pairing code pattern.
 *
 * Subcommands (planned):
 *   ch4p pairing generate   -- Generate a new pairing code
 *   ch4p pairing list       -- List active pairings
 *   ch4p pairing revoke     -- Revoke a pairing
 *   ch4p pairing status     -- Show pairing configuration status
 *
 * This file provides the CLI entry point and placeholder messaging.
 */

import { loadConfig } from '../config.js';

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function pairing(args: string[]): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${RED}Failed to load config:${RESET} ${message}`);
    console.error(`  ${DIM}Run ${CYAN}ch4p onboard${DIM} to set up ch4p.${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  const subcommand = args[0] ?? 'status';

  console.log(`\n  ${CYAN}${BOLD}ch4p Pairing${RESET}`);
  console.log(`  ${DIM}${'='.repeat(50)}${RESET}\n`);

  console.log(
    `  ${BOLD}Pairing required${RESET}  ${config.gateway.requirePairing ? `${GREEN}yes${RESET}` : `${YELLOW}no${RESET}`}`,
  );
  console.log(`  ${BOLD}Gateway port${RESET}      ${config.gateway.port}`);
  console.log('');

  switch (subcommand) {
    case 'generate':
      console.log(`  ${YELLOW}${BOLD}Not yet implemented.${RESET}`);
      console.log(`  ${DIM}Pairing code generation will be available when @ch4p/gateway is complete.${RESET}`);
      break;

    case 'list':
      console.log(`  ${YELLOW}${BOLD}Not yet implemented.${RESET}`);
      console.log(`  ${DIM}Active pairing listing will be available when @ch4p/gateway is complete.${RESET}`);
      break;

    case 'revoke':
      console.log(`  ${YELLOW}${BOLD}Not yet implemented.${RESET}`);
      console.log(`  ${DIM}Pairing revocation will be available when @ch4p/gateway is complete.${RESET}`);
      break;

    case 'status':
      console.log(`  ${DIM}Pairing management will be available when @ch4p/gateway is complete.${RESET}`);
      console.log(`  ${DIM}Subcommands: generate, list, revoke, status${RESET}`);
      break;

    default:
      console.log(`  ${RED}Unknown subcommand: ${subcommand}${RESET}`);
      console.log(`  ${DIM}Available: generate, list, revoke, status${RESET}`);
      process.exitCode = 1;
  }

  console.log('');
}
