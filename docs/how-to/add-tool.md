# How to Create a Custom Tool

This guide walks you through implementing the `ITool` interface to give your ch4p agent a new capability.

---

## Prerequisites

- A working ch4p development environment
- Familiarity with JSON Schema (used for parameter validation)

---

## Step 1: Create the Tool File

Create a new file in `packages/tools/src/`:

```bash
touch packages/tools/src/my-tool.ts
```

---

## Step 2: Implement ITool

```typescript
import type {
  ITool,
  ToolContext,
  ToolResult,
  ValidationResult,
  StateSnapshot,
  JSONSchema7,
} from '@ch4p/core';

export class MyTool implements ITool {
  readonly name = 'my_tool';
  readonly description = 'A short description of what this tool does.';
  readonly weight = 'lightweight' as const;  // or 'heavyweight' for worker pool

  readonly parameters: JSONSchema7 = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to execute.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results.',
        default: 10,
      },
    },
    required: ['query'],
  };

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const { query, limit = 10 } = args as { query: string; limit?: number };

    // Perform the tool's work.
    const results = await this.doWork(query, limit);

    return {
      success: true,
      output: JSON.stringify(results),
    };
  }

  validate(args: unknown): ValidationResult {
    if (typeof args !== 'object' || args === null) {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }
    const { query } = args as Record<string, unknown>;
    if (typeof query !== 'string' || query.length === 0) {
      return { valid: false, errors: ['query must be a non-empty string.'] };
    }
    return { valid: true };
  }
}
```

---

## Step 3: Set the Correct Weight

The `weight` field determines how the agent loop executes your tool:

| Weight | Execution | Use For |
|--------|-----------|---------|
| `lightweight` | Main thread | Fast I/O: file reads, regex, memory lookups. No blocking operations. |
| `heavyweight` | Worker pool | Shell commands, HTTP requests, sub-agent delegation. Anything that may block or run for more than a few milliseconds. |

Choose `heavyweight` when in doubt — it provides better isolation.

---

## Step 4: Implement Validation (Mandatory)

The agent loop calls `validate()` on every tool call before execution. If validation fails, the error is sent back to the LLM so it can self-correct without executing the tool.

This is a mandatory step for reliable tool use. Without it, the agent loop falls back to basic structural checks (args must be an object), which catches fewer errors.

```typescript
validate(args: unknown): ValidationResult {
  if (typeof args !== 'object' || args === null) {
    return { valid: false, errors: ['Arguments must be an object.'] };
  }

  const errors: string[] = [];
  const { query, limit } = args as Record<string, unknown>;

  if (typeof query !== 'string' || query.length === 0) {
    errors.push('query must be a non-empty string.');
  }
  if (limit !== undefined && (typeof limit !== 'number' || limit < 1)) {
    errors.push('limit must be a positive number.');
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true };
}
```

---

## Step 5: Add State Snapshots (Optional, Recommended)

If your tool modifies external state (files, databases, APIs), implement `getStateSnapshot()` to enable outcome verification. The agent loop captures state before and after execution to compute diffs.

```typescript
async getStateSnapshot(
  args: unknown,
  context: ToolContext,
): Promise<StateSnapshot> {
  const { path } = args as { path: string };

  return {
    timestamp: new Date().toISOString(),
    state: {
      fileExists: existsSync(path),
      fileSize: existsSync(path)
        ? statSync(path).size
        : null,
    },
    description: `State of ${path}`,
  };
}
```

State snapshots are used by the optional IVerifier to confirm that tools achieved their intended effects.

---

## Step 6: Handle Errors

Return structured errors rather than throwing:

```typescript
async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
  try {
    const result = await this.doWork(args);
    return { success: true, output: result };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Tool execution failed: ${(err as Error).message}`,
    };
  }
}
```

---

## Step 7: Register the Tool

Add to the tool registry in `packages/tools/src/index.ts`:

```typescript
export { MyTool } from './my-tool.js';
```

Then register it in your application's tool setup:

```typescript
import { ToolRegistry } from '@ch4p/tools';
import { MyTool } from '@ch4p/tools';

const registry = new ToolRegistry();
registry.register(new MyTool());
```

---

## Step 8: Verify Registration

Check that your tool is visible to the agent:

```bash
ch4p tools
```

Expected output includes your tool:

```
Available tools:
  file_read       Read files with line range support   [lightweight]
  file_write      Write files with directory creation   [lightweight]
  bash            Shell command execution               [heavyweight]
  my_tool         A short description...               [lightweight]
```

---

## Step 9: Connect MCP Tools (Alternative)

Instead of implementing ITool directly, you can connect external tools via the MCP (Model Context Protocol) client. This is useful when tools already exist as MCP servers:

```typescript
import { McpClientTool } from '@ch4p/tools';

const mcpTool = new McpClientTool({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@some-mcp-server'],
});

registry.register(mcpTool);
```

The MCP client tool discovers and proxies tools from any MCP-compliant server, supporting both stdio and SSE transports.

---

## Common Pitfalls

- **Always implement `validate()`**. The LLM can send malformed input. The agent loop calls validate on every tool call and feeds errors back to the LLM for self-correction.
- **Output size**: Keep `output` concise. Very large outputs consume token budget.
- **Timeouts**: Long-running tools should implement their own timeout logic. The worker pool has a global timeout, but tool-level timeouts provide better error messages.
- **Security context**: Use `context.securityPolicy` to check paths and commands. Never bypass the security layer.
- **State snapshots**: If your tool modifies state, implement `getStateSnapshot()` to enable verification. This is optional but significantly improves agent reliability.
