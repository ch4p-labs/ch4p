/**
 * Gateway command -- start the ch4p gateway server.
 *
 * The gateway is the central HTTP/WebSocket server that channels,
 * web clients, and native apps connect to. It is implemented in
 * @ch4p/gateway and will be fully available in Phase 3.
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

export async function gateway(_args: string[]): Promise<void> {
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

  const port = config.gateway.port;
  const binding = config.gateway.allowPublicBind ? '0.0.0.0' : '127.0.0.1';
  const pairing = config.gateway.requirePairing;

  console.log(`\n  ${CYAN}${BOLD}ch4p Gateway${RESET}`);
  console.log(`  ${DIM}${'='.repeat(50)}${RESET}\n`);
  console.log(`  ${BOLD}Binding${RESET}       ${binding}:${port}`);
  console.log(`  ${BOLD}Pairing${RESET}       ${pairing ? `${GREEN}required${RESET}` : `${YELLOW}disabled${RESET}`}`);
  console.log(`  ${BOLD}Tunnel${RESET}        ${config.tunnel.provider === 'none' ? `${DIM}disabled${RESET}` : config.tunnel.provider}`);
  console.log('');
  console.log(`  ${YELLOW}${BOLD}Not yet implemented.${RESET}`);
  console.log(`  ${DIM}The gateway server will be available when @ch4p/gateway is complete.${RESET}`);
  console.log(`  ${DIM}It will provide:${RESET}`);
  console.log(`  ${DIM}  - HTTP REST API for channel integrations${RESET}`);
  console.log(`  ${DIM}  - WebSocket connections for real-time streaming${RESET}`);
  console.log(`  ${DIM}  - Pairing code authentication${RESET}`);
  console.log(`  ${DIM}  - Session management${RESET}`);
  console.log(`  ${DIM}  - Tunnel exposure via ${config.tunnel.provider}${RESET}`);
  console.log('');
}
