/**
 * Provider Manager - Manage and select AI providers
 */

import { 
  Provider, 
  ProviderConfig, 
  ProviderType, 
  ProviderInfo 
} from './types.js';
import { APIProvider } from './api-provider.js';
import { BrowserProvider } from './browser-provider.js';
import { CLIProvider } from './cli-provider.js';
import { resolveProviderConfig } from '../config.js';

export class ProviderManager {
  private providers: Map<ProviderType, Provider> = new Map();
  private currentProvider: Provider | null = null;
  private config: ProviderConfig = { type: 'auto' };

  constructor() {
    // Register available providers
    this.providers.set('api', new APIProvider());
    this.providers.set('kimi', new APIProvider('kimi'));
    this.providers.set('openrouter', new APIProvider('openrouter'));
    this.providers.set('custom', new APIProvider('custom'));
    this.providers.set('browser', new BrowserProvider());
    this.providers.set('cli', new CLIProvider());
  }

  /**
   * Initialize provider with config
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = resolveProviderConfig(config);

    let providerType = this.config.type;

    // Auto-detect best provider
    if (providerType === 'auto') {
      providerType = await this.autoDetectProvider();
      console.log(`[AUTO] Selected provider: ${providerType}`);
    }

    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }

    // Prepare config for specific provider
    const providerConfig: ProviderConfig = {
      ...this.config,
      type: providerType,
    };

    await provider.initialize(providerConfig);
    this.currentProvider = provider;
  }

  /**
   * Auto-detect best available provider
   */
  private async autoDetectProvider(): Promise<ProviderType> {
    console.log('[DETECT] Finding best provider...');

    // 1. OpenRouter/custom/generic API keys are fastest and most reliable.
    const apiPreference: ProviderType[] = ['openrouter', 'custom', 'api', 'kimi'];
    for (const type of apiPreference) {
      const api = this.providers.get(type)!;
      try {
        await api.initialize(resolveProviderConfig({ type }));
        const available = await api.isAvailable();
        if (available) {
          console.log(`[OK] Using ${api.name}`);
          return type;
        }
      } catch {
        // Continue to next option
      }
    }

    throw new Error(
      'No API provider is configured.\n' +
      'Run: omk config init openrouter --global --model <provider/model>\n' +
      'Then set OPENROUTER_API_KEY, or choose an explicit fallback with --cli or --browser.'
    );
  }

  /**
   * Get current provider
   */
  getProvider(): Provider {
    if (!this.currentProvider) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.currentProvider;
  }

  /**
   * Get provider info for all types
   */
  async getProviderInfo(): Promise<ProviderInfo[]> {
    return [
      {
        type: 'api',
        name: 'Generic OpenAI-compatible API',
        description: 'Direct API connection using OMK_API_* or KIMI_* compatibility variables.',
        requirements: ['OMK_API_KEY or KIMI_API_KEY'],
        isAvailable: Boolean(process.env.OMK_API_KEY || process.env.KIMI_API_KEY),
      },
      {
        type: 'kimi',
        name: 'Kimi API',
        description: 'Moonshot/Kimi API preset.',
        requirements: ['KIMI_API_KEY environment variable'],
        isAvailable: Boolean(process.env.KIMI_API_KEY),
      },
      {
        type: 'openrouter',
        name: 'OpenRouter API',
        description: 'OpenRouter OpenAI-compatible gateway.',
        requirements: ['OPENROUTER_API_KEY environment variable'],
        isAvailable: Boolean(process.env.OPENROUTER_API_KEY),
      },
      {
        type: 'custom',
        name: 'Custom API',
        description: 'Custom OpenAI-compatible gateway.',
        requirements: ['CUSTOM_API_BASE_URL', 'CUSTOM_API_KEY', 'CUSTOM_API_MODEL'],
        isAvailable: Boolean(process.env.CUSTOM_API_BASE_URL && process.env.CUSTOM_API_KEY),
      },
      {
        type: 'cli',
        name: 'Kimi CLI',
        description: 'Official Kimi CLI if installed.',
        requirements: ['kimi CLI installed'],
        isAvailable: await this.providers.get('cli')!.isAvailable(),
      },
      {
        type: 'browser',
        name: 'Kimi Web (Browser)',
        description: 'Uses web interface with your subscription. Free if you have subscription!',
        requirements: ['Playwright installed', 'Logged in to kimi.moonshot.cn'],
        isAvailable: true,
      },
      {
        type: 'auto',
        name: 'Auto-detect',
        description: 'Automatically select best available provider.',
        requirements: [],
        isAvailable: true,
      },
    ];
  }

  /**
   * Switch provider
   */
  async switchProvider(type: ProviderType, config?: Partial<ProviderConfig>): Promise<void> {
    // Disconnect current
    if (this.currentProvider) {
      await this.currentProvider.disconnect();
    }

    // Initialize new
    const newConfig: ProviderConfig = {
      ...this.config,
      ...config,
      type,
    };

    await this.initialize(newConfig);
  }

  /**
   * Disconnect all providers
   */
  async disconnect(): Promise<void> {
    if (this.currentProvider) {
      await this.currentProvider.disconnect();
      this.currentProvider = null;
    }
  }

  /**
   * Get current provider type
   */
  getCurrentType(): ProviderType | null {
    return this.currentProvider?.type ?? null;
  }
}

// Singleton instance
let manager: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!manager) {
    manager = new ProviderManager();
  }
  return manager;
}

export function resetProviderManager(): void {
  manager = null;
}
