/**
 * Observer registry — factory that builds observers from config.
 *
 * Reads the `observability` section of Ch4pConfig and returns a ready-to-use
 * IObserver (potentially a MultiObserver wrapping several children).
 */

import type { IObserver } from '@ch4p/core';

import { ConsoleObserver } from './console-observer.js';
import type { LogLevel } from './console-observer.js';
import { FileObserver } from './file-observer.js';
import type { FileObserverOptions } from './file-observer.js';
import { MultiObserver } from './multi-observer.js';
import { NoopObserver } from './noop-observer.js';

// ---------------------------------------------------------------------------
// Public config shape (mirrors the observability section of Ch4pConfig)
// ---------------------------------------------------------------------------

export interface ObservabilityConfig {
  /** Observer names to activate (e.g. ["console", "file"]). */
  observers: string[];
  /** Minimum log level for console output. */
  logLevel?: LogLevel;
  /** Path for the JSONL file observer. */
  logPath?: string;
  /** Max log file size in bytes before rotation. */
  maxLogSize?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an IObserver from configuration.
 *
 * - If `observers` is empty, returns a NoopObserver.
 * - If a single observer is listed, returns it directly.
 * - If multiple observers are listed, wraps them in a MultiObserver.
 */
export function createObserver(config: ObservabilityConfig): IObserver {
  const { observers, logLevel = 'info', logPath, maxLogSize } = config;

  if (!observers || observers.length === 0) {
    return new NoopObserver();
  }

  const children: IObserver[] = [];

  for (const name of observers) {
    switch (name) {
      case 'console':
        children.push(new ConsoleObserver(logLevel));
        break;
      case 'file': {
        const fileOpts: FileObserverOptions = {};
        if (logPath) fileOpts.filePath = logPath;
        if (maxLogSize) fileOpts.maxBytes = maxLogSize;
        children.push(new FileObserver(fileOpts));
        break;
      }
      case 'noop':
        children.push(new NoopObserver());
        break;
      default:
        // Unknown observer name — warn but do not crash.
        console.warn(`[observability] unknown observer "${name}", skipping`);
        break;
    }
  }

  if (children.length === 0) {
    return new NoopObserver();
  }

  if (children.length === 1) {
    return children[0]!;
  }

  return new MultiObserver(children);
}
