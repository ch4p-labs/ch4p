/**
 * Provider registry — central registry for LLM providers.
 *
 * Maps provider IDs to IProvider instances and provides a factory method
 * to create the right provider based on configuration.
 */

import type { IProvider } from '@ch4p/core';
import { ProviderError } from '@ch4p/core';

import { AnthropicProvider } from './anthropic.js';
import type { AnthropicProviderConfig } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import type { OpenAIProviderConfig } from './openai.js';
import { OpenRouterProvider } from './openrouter.js';
import type { OpenRouterProviderConfig } from './openrouter.js';
import { GoogleProvider } from './google.js';
import type { GoogleProviderConfig } from './google.js';
import { OllamaProvider } from './ollama.js';
import type { OllamaProviderConfig } from './ollama.js';
import { BedrockProvider } from './bedrock.js';
import type { BedrockProviderConfig } from './bedrock.js';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  id: string;
  type: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'ollama' | 'bedrock' | string;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  defaultModel?: string;
  maxRetries?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private readonly providers = new Map<string, IProvider>();

  /**
   * Register a provider instance under its id.
   * If a provider with the same id already exists, it is replaced.
   */
  register(provider: IProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a provider by id.
   * Throws ProviderError if not found.
   */
  get(id: string): IProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(
        `Provider "${id}" not found. Available: ${[...this.providers.keys()].join(', ') || '(none)'}`,
        id,
      );
    }
    return provider;
  }

  /**
   * Check if a provider is registered.
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * List all registered provider IDs.
   */
  list(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * List all registered provider instances.
   */
  listProviders(): IProvider[] {
    return [...this.providers.values()];
  }

  /**
   * Remove a provider from the registry.
   * Returns true if the provider was found and removed.
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Clear all registered providers.
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Create a provider instance from config and register it.
   * Returns the created provider.
   */
  createFromConfig(config: ProviderConfig): IProvider {
    const provider = ProviderRegistry.createProvider(config);
    this.register(provider);
    return provider;
  }

  /**
   * Create and register multiple providers from a configuration map.
   * The map keys are provider IDs, values are provider-specific configs
   * including a required `type` field.
   */
  createFromConfigMap(
    configs: Record<string, Record<string, unknown>>,
  ): void {
    for (const [id, rawConfig] of Object.entries(configs)) {
      // Require a `type` field; default to the id if it matches a known type
      const type = (rawConfig.type as string) ?? id;
      const config: ProviderConfig = { id, type, ...rawConfig };
      this.createFromConfig(config);
    }
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  /**
   * Create a provider instance from config without registering it.
   */
  static createProvider(config: ProviderConfig): IProvider {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicProvider({
          apiKey: config.apiKey ?? '',
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel,
          maxRetries: config.maxRetries,
        } satisfies AnthropicProviderConfig);

      case 'openai':
        return new OpenAIProvider({
          apiKey: config.apiKey ?? '',
          baseUrl: config.baseUrl,
          organization: config.organization,
          defaultModel: config.defaultModel,
          maxRetries: config.maxRetries,
        } satisfies OpenAIProviderConfig);

      case 'openrouter':
        return new OpenRouterProvider({
          apiKey: config.apiKey ?? '',
          baseUrl: config.baseUrl,
          siteUrl: config.siteUrl as string | undefined,
          siteName: config.siteName as string | undefined,
          defaultModel: config.defaultModel,
          maxRetries: config.maxRetries,
        } satisfies OpenRouterProviderConfig);

      case 'google':
        return new GoogleProvider({
          apiKey: config.apiKey ?? '',
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel,
          maxRetries: config.maxRetries,
        } satisfies GoogleProviderConfig);

      case 'ollama':
        return new OllamaProvider({
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel,
        } satisfies OllamaProviderConfig);

      case 'bedrock':
        return new BedrockProvider({
          region: (config.region as string) ?? '',
          accessKeyId: (config.accessKeyId as string) ?? config.apiKey ?? '',
          secretAccessKey: (config.secretAccessKey as string) ?? '',
          sessionToken: config.sessionToken as string | undefined,
          baseUrl: config.baseUrl,
          defaultModel: config.defaultModel,
          maxRetries: config.maxRetries,
        } satisfies BedrockProviderConfig);

      default:
        throw new ProviderError(
          `Unknown provider type: "${config.type}". Supported types: anthropic, openai, openrouter, google, ollama, bedrock`,
          config.id,
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Default singleton
// ---------------------------------------------------------------------------

/**
 * Default global provider registry.
 * Most consumers should use this rather than creating their own instance.
 */
export const defaultRegistry = new ProviderRegistry();
