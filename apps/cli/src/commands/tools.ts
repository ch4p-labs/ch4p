/**
 * Tools command -- list all registered tools with metadata.
 *
 * Displays each tool's name, description, and weight classification
 * (lightweight or heavyweight). In future phases, this will read
 * from the actual tool registry in @ch4p/tools.
 */

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';

// ---------------------------------------------------------------------------
// Built-in tool registry (will be replaced by @ch4p/tools)
// ---------------------------------------------------------------------------

interface ToolInfo {
  name: string;
  description: string;
  weight: 'lightweight' | 'heavyweight';
}

/**
 * Default tool catalog. These represent the planned tools for ch4p.
 * When @ch4p/tools is fully implemented, this list will be dynamically
 * loaded from the tool registry.
 */
const BUILTIN_TOOLS: ToolInfo[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file within the workspace',
    weight: 'lightweight',
  },
  {
    name: 'write_file',
    description: 'Write content to a file within the workspace',
    weight: 'lightweight',
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path',
    weight: 'lightweight',
  },
  {
    name: 'search_files',
    description: 'Search for files matching a glob pattern',
    weight: 'lightweight',
  },
  {
    name: 'grep',
    description: 'Search file contents using regex patterns',
    weight: 'lightweight',
  },
  {
    name: 'bash',
    description: 'Execute a shell command from the allowlist',
    weight: 'heavyweight',
  },
  {
    name: 'git',
    description: 'Execute git operations (status, diff, log, commit, etc.)',
    weight: 'lightweight',
  },
  {
    name: 'memory_store',
    description: 'Store information in persistent memory',
    weight: 'lightweight',
  },
  {
    name: 'memory_recall',
    description: 'Recall information from persistent memory using hybrid search',
    weight: 'lightweight',
  },
  {
    name: 'browser',
    description: 'Control a headless browser via CDP for web automation',
    weight: 'heavyweight',
  },
  {
    name: 'http',
    description: 'Make HTTP requests to external APIs',
    weight: 'lightweight',
  },
  {
    name: 'delegate',
    description: 'Delegate a subtask to a different engine or model',
    weight: 'heavyweight',
  },
];

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function weightLabel(weight: 'lightweight' | 'heavyweight'): string {
  return weight === 'lightweight'
    ? `${GREEN}lightweight${RESET}`
    : `${YELLOW}heavyweight${RESET}`;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function tools(): Promise<void> {
  console.log(`\n  ${CYAN}${BOLD}ch4p Tools${RESET}`);
  console.log(`  ${DIM}${'='.repeat(50)}${RESET}\n`);

  // Find the longest tool name for alignment.
  const maxNameLen = Math.max(...BUILTIN_TOOLS.map((t) => t.name.length));

  for (const tool of BUILTIN_TOOLS) {
    const paddedName = tool.name.padEnd(maxNameLen + 2, ' ');
    console.log(
      `  ${MAGENTA}${BOLD}${paddedName}${RESET}` +
      `${tool.description}`,
    );
    console.log(
      `  ${''.padEnd(maxNameLen + 2, ' ')}` +
      `${DIM}weight: ${RESET}${weightLabel(tool.weight)}`,
    );
  }

  const lwCount = BUILTIN_TOOLS.filter((t) => t.weight === 'lightweight').length;
  const hwCount = BUILTIN_TOOLS.filter((t) => t.weight === 'heavyweight').length;

  console.log(`\n  ${DIM}${'='.repeat(50)}${RESET}`);
  console.log(
    `  ${BUILTIN_TOOLS.length} tools ` +
    `(${GREEN}${lwCount} lightweight${RESET}, ${YELLOW}${hwCount} heavyweight${RESET})`,
  );
  console.log(`  ${DIM}Lightweight tools run on the main thread.${RESET}`);
  console.log(`  ${DIM}Heavyweight tools run in worker threads for isolation.${RESET}\n`);
}
