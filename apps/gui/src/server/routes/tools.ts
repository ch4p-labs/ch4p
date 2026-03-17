/**
 * GET /api/tools — list available tools and skills.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, configExists, getCh4pDir } from '../config.js';

export interface ToolInfo {
  name: string;
  type: 'builtin' | 'skill' | 'mcp';
  enabled: boolean;
  description?: string;
}

export interface ToolsResponse {
  tools: ToolInfo[];
  skillsEnabled: boolean;
  skillPaths: string[];
  mcpServers: string[];
}

/** Built-in tools that ch4p always has available. */
const BUILTIN_TOOLS: ToolInfo[] = [
  { name: 'read_file', type: 'builtin', enabled: true, description: 'Read file contents' },
  { name: 'write_file', type: 'builtin', enabled: true, description: 'Write or create files' },
  { name: 'edit_file', type: 'builtin', enabled: true, description: 'Edit file with search/replace' },
  { name: 'list_dir', type: 'builtin', enabled: true, description: 'List directory contents' },
  { name: 'shell', type: 'builtin', enabled: true, description: 'Execute shell commands' },
  { name: 'web_search', type: 'builtin', enabled: true, description: 'Search the web' },
  { name: 'web_fetch', type: 'builtin', enabled: true, description: 'Fetch a URL' },
  { name: 'memory_store', type: 'builtin', enabled: true, description: 'Store to long-term memory' },
  { name: 'memory_recall', type: 'builtin', enabled: true, description: 'Recall from memory' },
];

/** Scan a skills directory for .md skill files. */
function scanSkillDir(dir: string): ToolInfo[] {
  const expanded = dir.replace(/^~/, process.env['HOME'] ?? '');
  const resolved = resolve(expanded);
  if (!existsSync(resolved)) return [];

  try {
    const entries = readdirSync(resolved, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => {
        const name = e.name.replace(/\.md$/, '');
        let description: string | undefined;
        try {
          const content = readFileSync(resolve(resolved, e.name), 'utf8');
          // Extract first non-empty, non-heading line as description
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
              description = trimmed.slice(0, 100);
              break;
            }
          }
        } catch { /* ignore read errors */ }
        return { name, type: 'skill' as const, enabled: true, description };
      });
  } catch {
    return [];
  }
}

export function getTools(): ToolsResponse {
  if (!configExists()) {
    return {
      tools: BUILTIN_TOOLS,
      skillsEnabled: false,
      skillPaths: [],
      mcpServers: [],
    };
  }

  const config = loadConfig();
  const skillsEnabled = config.skills?.enabled ?? true;
  const skillPaths = config.skills?.paths ?? ['~/.ch4p/skills', '.ch4p/skills', '.agents/skills'];

  const tools: ToolInfo[] = [...BUILTIN_TOOLS];

  // Scan skill directories
  if (skillsEnabled) {
    for (const dir of skillPaths) {
      tools.push(...scanSkillDir(dir));
    }
  }

  // MCP servers from config
  const mcpServers: string[] = [];
  const mcpConfig = (config as Record<string, unknown>)['mcp'] as Record<string, unknown> | undefined;
  if (mcpConfig?.['servers']) {
    const servers = mcpConfig['servers'] as Record<string, unknown>;
    for (const name of Object.keys(servers)) {
      mcpServers.push(name);
      tools.push({ name, type: 'mcp', enabled: true, description: `MCP server: ${name}` });
    }
  }

  return { tools, skillsEnabled, skillPaths, mcpServers };
}
