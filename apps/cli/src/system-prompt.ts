/**
 * buildSystemPrompt — shared system prompt builder for CLI agent and gateway.
 *
 * Constructs the ch4p system prompt with capability hints based on what features
 * are available in the current session. Used by BOTH the interactive CLI agent
 * and the gateway message processor so the model always gets the same accurate
 * picture of its capabilities regardless of which entry point is used.
 *
 * Previously, the gateway used a hardcoded 3-sentence prompt that never told
 * the model it had memory or web search. This led to the model claiming it had
 * no persistent memory and not using web tools on non-CLI channels.
 */

import type { SkillRegistry } from '@ch4p/skills';

export interface SystemPromptOpts {
  /** Whether a memory backend is available (memory_store / memory_recall tools). */
  hasMemory?: boolean;
  /** Whether web search is configured (web_search tool). */
  hasSearch?: boolean;
  /** Skill registry — if non-empty, descriptions are appended for progressive disclosure. */
  skillRegistry?: SkillRegistry;
}

/**
 * Build the ch4p system prompt with accurate capability hints.
 *
 * @param opts - Feature availability flags
 * @returns The assembled system prompt string
 */
export function buildSystemPrompt(opts: SystemPromptOpts = {}): string {
  let prompt =
    'You are ch4p, a personal AI assistant. ' +
    'You are helpful, concise, and security-conscious. ' +
    'When asked to perform actions, respect the configured autonomy level.';

  if (opts.hasMemory) {
    prompt +=
      ' You have persistent memory — you can recall information from previous conversations ' +
      'and learn from interactions over time. Use the memory_store and memory_recall tools ' +
      'to explicitly save or retrieve specific information when helpful.';
  }

  if (opts.hasSearch) {
    prompt +=
      ' You have web search capability — use the web_search tool to find ' +
      'current information, look up facts, or research topics when needed.';
  }

  if (opts.skillRegistry && opts.skillRegistry.size > 0) {
    const descriptions = opts.skillRegistry
      .getDescriptions()
      .map((s) => `  - ${s.name}: ${s.description}`)
      .join('\n');
    prompt +=
      '\n\nAvailable skills (use the `load_skill` tool with the skill name to get full instructions):\n' +
      descriptions;
  }

  return prompt;
}
