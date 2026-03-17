/**
 * GUI command — start the ch4p graphical interface.
 *
 * Starts the GUI server (raw node:http, zero external deps) and
 * opens the browser to the local URL.
 *
 * Usage:
 *   ch4p gui              — start GUI and open browser
 *   ch4p gui --port N     — override the default port (4810)
 *   ch4p gui --no-open    — don't auto-open browser
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { TEAL, RESET, BOLD, DIM, GREEN, RED } from '../ui.js';

export async function gui(args: string[]): Promise<void> {
  let port = 4810;
  let autoOpen = true;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const p = parseInt(args[i + 1]!, 10);
      if (!isNaN(p) && p > 0 && p <= 65535) port = p;
      i++;
    }
    if (args[i] === '--no-open') {
      autoOpen = false;
    }
  }

  // Resolve the GUI server entry point
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const guiPaths = [
    resolve(__dirname, '..', '..', '..', 'gui', 'dist', 'server', 'index.js'),
    resolve(__dirname, '..', '..', 'gui', 'dist', 'server', 'index.js'),
  ];

  let guiEntry: string | undefined;
  for (const p of guiPaths) {
    if (existsSync(p)) {
      guiEntry = p;
      break;
    }
  }

  if (!guiEntry) {
    console.error(`\n  ${RED}GUI not found.${RESET} Build it first:`);
    console.error(`  ${DIM}cd apps/gui && pnpm build${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  // Dynamic import of the GUI server
  const { createGuiServer } = await import(guiEntry) as {
    createGuiServer: (opts?: { port?: number; staticDir?: string }) => {
      start: () => Promise<{ port: number; host: string }>;
      stop: () => Promise<void>;
    };
  };

  const server = createGuiServer({ port });

  try {
    const { port: boundPort, host } = await server.start();
    const url = `http://${host}:${boundPort}`;

    console.log(`
  ${TEAL}${BOLD}ch4p GUI${RESET} running at ${GREEN}${url}${RESET}

  ${DIM}Press Ctrl+C to stop.${RESET}
`);

    // Auto-open browser
    if (autoOpen) {
      try {
        const openCmd = process.platform === 'darwin'
          ? `open "${url}"`
          : process.platform === 'win32'
            ? `start "${url}"`
            : `xdg-open "${url}"`;
        execSync(openCmd, { stdio: 'ignore' });
      } catch {
        // Silently ignore if browser can't be opened
      }
    }

    // Keep process alive until Ctrl+C
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log(`\n  ${DIM}Stopping GUI server...${RESET}`);
        server.stop().then(resolve).catch(resolve);
      });
      process.on('SIGTERM', () => {
        server.stop().then(resolve).catch(resolve);
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  ${RED}Failed to start GUI:${RESET} ${message}\n`);
    process.exitCode = 1;
  }
}
