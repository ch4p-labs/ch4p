/**
 * MCP Client tool — connects to Model Context Protocol servers.
 *
 * Heavyweight tool that acts as a universal bridge to any MCP-compliant
 * server. On first connection it discovers available tools via `list_tools`,
 * caches their definitions, and proxies `call_tool` invocations.
 *
 * This implements the MCP client side of the protocol:
 *   1. Connect to an MCP server via stdio or HTTP/SSE transport
 *   2. Discover tools via tools/list
 *   3. Proxy tool calls via tools/call
 *
 * Inspired by AWM's insight that universal tool interfaces dramatically
 * expand agent capability without per-tool engineering.
 */

import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  JSONSchema7,
  ToolDefinition,
} from '@ch4p/core';
import { ToolError } from '@ch4p/core';

// ---------------------------------------------------------------------------
// MCP Protocol Types
// ---------------------------------------------------------------------------

/**
 * MCP JSON-RPC message envelope.
 */
interface McpRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

export type McpTransport = 'stdio' | 'sse';

export interface McpServerConfig {
  /** Transport type: 'stdio' for subprocess, 'sse' for HTTP/SSE. */
  transport: McpTransport;
  /** For stdio: the command to launch the MCP server. */
  command?: string;
  /** For stdio: arguments to pass to the command. */
  args?: string[];
  /** For stdio: environment variables for the subprocess. */
  env?: Record<string, string>;
  /** For sse: the server URL (e.g., http://localhost:3001/sse). */
  url?: string;
  /** Connection timeout in ms. Default: 10000. */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// MCP Connection (stdio transport)
// ---------------------------------------------------------------------------

/**
 * StdioConnection wraps a child process running an MCP server.
 * Communication happens via JSON-RPC 2.0 over stdin/stdout.
 */
class StdioConnection {
  private process: import('child_process').ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: McpResponse) => void;
    reject: (reason: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private buffer = '';
  private timeoutMs: number;

  constructor(private config: McpServerConfig) {
    this.timeoutMs = config.timeout ?? 10_000;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new ToolError('MCP stdio transport requires a command.', 'mcp_client');
    }

    const { spawn } = await import('child_process');
    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new ToolError('Failed to open stdio pipes to MCP server.', 'mcp_client');
    }

    this.process.stdout.setEncoding('utf-8');
    this.process.stdout.on('data', (chunk: string) => this.handleData(chunk));

    this.process.on('error', (err) => {
      this.rejectAll(new ToolError(`MCP server process error: ${err.message}`, 'mcp_client'));
    });

    this.process.on('exit', (code) => {
      this.rejectAll(new ToolError(`MCP server process exited with code ${code}`, 'mcp_client'));
    });

    // Send initialize handshake
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ch4p', version: '0.1.0' },
    });

    // Confirm initialization
    await this.notify('notifications/initialized', {});
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const message: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new ToolError(`MCP request timed out: ${method}`, 'mcp_client'));
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (response: McpResponse) => {
          if (response.error) {
            reject(new ToolError(
              `MCP error (${response.error.code}): ${response.error.message}`,
              'mcp_client',
            ));
          } else {
            resolve(response.result);
          }
        },
        reject,
        timeout,
      });

      this.send(message);
    });
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const message = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };
    this.send(message);
  }

  async disconnect(): Promise<void> {
    this.rejectAll(new ToolError('Connection closed.', 'mcp_client'));
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  private send(message: McpRequest | Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      throw new ToolError('MCP server stdin is not writable.', 'mcp_client');
    }
    const json = JSON.stringify(message);
    this.process.stdin.write(json + '\n');
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed) as McpResponse;
        if (response.id !== undefined) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch {
        // Non-JSON line — ignore (could be server stderr leaking)
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// MCP Connection (SSE transport)
// ---------------------------------------------------------------------------

/**
 * SseConnection talks to an MCP server over HTTP + Server-Sent Events.
 */
class SseConnection {
  private baseUrl: string;
  private sessionUrl: string | null = null;
  private timeoutMs: number;

  constructor(config: McpServerConfig) {
    if (!config.url) {
      throw new ToolError('MCP SSE transport requires a url.', 'mcp_client');
    }
    this.baseUrl = config.url;
    this.timeoutMs = config.timeout ?? 10_000;
  }

  async connect(): Promise<void> {
    // Send initialize handshake via POST
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ch4p', version: '0.1.0' },
    });

    // If the server returned a session endpoint, use it for future requests
    if (result && typeof result === 'object' && 'sessionUrl' in (result as Record<string, unknown>)) {
      this.sessionUrl = (result as Record<string, unknown>).sessionUrl as string;
    }

    // Confirm initialization
    await this.request('notifications/initialized', {});
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const url = this.sessionUrl ?? this.baseUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body: McpRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ToolError(
          `MCP SSE request failed: HTTP ${response.status}`,
          'mcp_client',
        );
      }

      const json = await response.json() as McpResponse;
      if (json.error) {
        throw new ToolError(
          `MCP error (${json.error.code}): ${json.error.message}`,
          'mcp_client',
        );
      }

      return json.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async disconnect(): Promise<void> {
    // SSE transport is stateless on the client side — nothing to clean up.
    this.sessionUrl = null;
  }
}

// ---------------------------------------------------------------------------
// Connection factory
// ---------------------------------------------------------------------------

type McpConnection = StdioConnection | SseConnection;

function createConnection(config: McpServerConfig): McpConnection {
  switch (config.transport) {
    case 'stdio':
      return new StdioConnection(config);
    case 'sse':
      return new SseConnection(config);
    default:
      throw new ToolError(
        `Unsupported MCP transport: ${config.transport}`,
        'mcp_client',
      );
  }
}

// ---------------------------------------------------------------------------
// McpClientTool
// ---------------------------------------------------------------------------

interface McpClientArgs {
  action: 'list_tools' | 'call_tool';
  /** Required when action is 'call_tool'. The name of the remote tool. */
  tool?: string;
  /** Arguments to pass to the remote tool. */
  args?: Record<string, unknown>;
}

export class McpClientTool implements ITool {
  readonly name = 'mcp_client';
  readonly description =
    'Connect to a Model Context Protocol (MCP) server and interact with its tools. ' +
    'Use action "list_tools" to discover available tools, or "call_tool" to execute one. ' +
    'Supports stdio and SSE transports.';

  readonly weight = 'heavyweight' as const;

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_tools', 'call_tool'],
        description: 'The action to perform: "list_tools" discovers available tools, "call_tool" executes a tool.',
      },
      tool: {
        type: 'string',
        description: 'The name of the remote tool to call. Required when action is "call_tool".',
      },
      args: {
        type: 'object',
        description: 'Arguments to pass to the remote tool.',
        additionalProperties: true,
      },
    },
    required: ['action'],
    additionalProperties: false,
  };

  private connection: McpConnection | null = null;
  private cachedTools: McpToolDef[] = [];
  private serverConfig: McpServerConfig;

  constructor(serverConfig: McpServerConfig) {
    this.serverConfig = serverConfig;
  }

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    const { action, tool, args: toolArgs } = args as Record<string, unknown>;
    const errors: string[] = [];

    if (action !== 'list_tools' && action !== 'call_tool') {
      errors.push('action must be "list_tools" or "call_tool".');
    }

    if (action === 'call_tool') {
      if (typeof tool !== 'string' || tool.trim().length === 0) {
        errors.push('tool must be a non-empty string when action is "call_tool".');
      }
    }

    if (toolArgs !== undefined && (typeof toolArgs !== 'object' || toolArgs === null)) {
      errors.push('args must be an object.');
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const validation = this.validate(args);
    if (!validation.valid) {
      return {
        success: false,
        output: '',
        error: `Invalid arguments: ${validation.errors!.join(' ')}`,
      };
    }

    const { action, tool, args: toolArgs } = args as McpClientArgs;

    // Ensure connection
    if (!this.connection) {
      try {
        context.onProgress('Connecting to MCP server...');
        this.connection = createConnection(this.serverConfig);
        await this.connection.connect();
        context.onProgress('Connected to MCP server.');
      } catch (err) {
        return {
          success: false,
          output: '',
          error: `Failed to connect to MCP server: ${(err as Error).message}`,
        };
      }
    }

    if (context.abortSignal.aborted) {
      return { success: false, output: '', error: 'Request aborted.' };
    }

    switch (action) {
      case 'list_tools':
        return this.listTools(context);
      case 'call_tool':
        return this.callTool(tool!, toolArgs ?? {}, context);
      default:
        return { success: false, output: '', error: `Unknown action: ${action}` };
    }
  }

  /**
   * Discover available tools on the connected MCP server.
   */
  private async listTools(context: ToolContext): Promise<ToolResult> {
    try {
      context.onProgress('Discovering MCP tools...');
      const result = await this.connection!.request('tools/list', {}) as {
        tools: McpToolDef[];
      };

      this.cachedTools = result.tools ?? [];

      const toolList = this.cachedTools.map((t) => ({
        name: t.name,
        description: t.description ?? '(no description)',
      }));

      return {
        success: true,
        output: JSON.stringify(toolList, null, 2),
        metadata: {
          toolCount: this.cachedTools.length,
          tools: this.cachedTools.map(t => t.name),
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to list MCP tools: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Execute a tool on the connected MCP server via tools/call.
   */
  private async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    try {
      context.onProgress(`Calling MCP tool: ${toolName}...`);

      const result = await this.connection!.request('tools/call', {
        name: toolName,
        arguments: toolArgs,
      }) as McpToolCallResult;

      // Extract text content from the MCP response
      const textContent = (result.content ?? [])
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');

      return {
        success: !result.isError,
        output: textContent || '(no output)',
        error: result.isError ? textContent : undefined,
        metadata: {
          mcpTool: toolName,
          contentBlocks: result.content?.length ?? 0,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `MCP tool call failed: ${(err as Error).message}`,
        metadata: { mcpTool: toolName },
      };
    }
  }

  /**
   * Get the cached tool definitions from the MCP server as ch4p ToolDefinitions.
   * Useful for exposing MCP tools as native tool definitions to the LLM.
   */
  getCachedToolDefinitions(): ToolDefinition[] {
    return this.cachedTools.map((t) => ({
      name: `mcp:${t.name}`,
      description: t.description ?? '',
      parameters: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  }

  abort(_reason: string): void {
    this.connection?.disconnect();
    this.connection = null;
  }

  /**
   * Cleanly disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    await this.connection?.disconnect();
    this.connection = null;
    this.cachedTools = [];
  }
}
