/**
 * Tool worker thread entry point.
 *
 * This file is compiled as a standalone ESM bundle (packages/agent/dist/worker.js)
 * and spawned by ToolWorkerPool when heavyweight tools need process isolation.
 *
 * Design decisions:
 *   - ToolRegistry is created once at startup (not per message) — avoids init cost per task.
 *   - DefaultSecurityPolicy is reconstructed per task from WorkerTaskContext so the
 *     workspace path is always scoped to the calling session's cwd.
 *   - autonomyLevel is 'full' because the parent AgentLoop already enforced security
 *     constraints before deciding to dispatch to a worker.
 *   - x402Signer is intentionally absent: functions cannot cross worker thread boundaries.
 *     If web_fetch receives an HTTP 402 it returns { success: false, x402Required: true }
 *     and the agent must use the x402_pay tool to complete payment manually.
 *
 * Message protocol (parent → worker):
 *   { type: 'execute', tool: string, args: unknown, context: WorkerTaskContext }
 *
 * Message protocol (worker → parent):
 *   { type: 'progress', update: string }
 *   { type: 'result',   result: ToolResult }
 *   { type: 'error',    message: string }
 */

import { parentPort } from 'node:worker_threads';
import { ToolRegistry } from '@ch4p/tools';
import { DefaultSecurityPolicy } from '@ch4p/security';
import type { ToolContext } from '@ch4p/core';
import type { WorkerTaskContext } from './worker-pool.js';

if (!parentPort) {
  throw new Error('worker.ts must run as a worker thread (parentPort is null).');
}

// ---------------------------------------------------------------------------
// One-time startup: create the tool registry.
// ---------------------------------------------------------------------------

const registry = ToolRegistry.createDefault();

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------

parentPort.on('message', async (msg: unknown) => {
  const message = msg as {
    type: string;
    tool?: string;
    args?: unknown;
    context?: WorkerTaskContext;
  };

  if (message.type !== 'execute' || !message.tool || !message.context) {
    // Silently ignore unrecognised messages.
    return;
  }

  const { tool: toolName, args, context } = message;

  // Look up the tool in the registry.
  const tool = registry.get(toolName);
  if (!tool) {
    parentPort!.postMessage({
      type: 'error',
      message: `Tool not found in worker registry: ${toolName}`,
    });
    return;
  }

  // Reconstruct a full ToolContext from the minimal WorkerTaskContext.
  //
  // NOTE: x402Signer is deliberately omitted — functions cannot serialise
  // across worker thread boundaries. If web_fetch hits a 402, it returns
  // x402Required: true and the model falls back to the x402_pay tool.
  const toolContext: ToolContext = {
    sessionId: context.sessionId,
    cwd: context.cwd,
    securityPolicy: new DefaultSecurityPolicy({
      workspace: context.cwd,
      autonomyLevel: 'full', // parent already validated the call
    }),
    abortSignal: new AbortController().signal,
    onProgress: (update: string) => {
      parentPort!.postMessage({ type: 'progress', update });
    },
  };

  try {
    const result = await tool.execute(args, toolContext);
    parentPort!.postMessage({ type: 'result', result });
  } catch (err) {
    parentPort!.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
