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

export class ProviderManager {
  private providers: Map<ProviderType, Provider> = new Map();
  private currentProvider: Provider | null = null;
  private config: ProviderConfig = { type: 'auto' };

  constructor() {
    // Register available providers
    this.providers.set('api', new APIProvider());
    this.providers.set('browser', new BrowserProvider());
    this.providers.set('cli', new CLIProvider());
  }

  /**
   * Initialize provider with config
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;

    let providerType = config.type;

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
      ...config,
      type: providerType,
    };

    // Add API key from environment if using API mode
    if (providerType === 'api' && !providerConfig.apiKey) {
      providerConfig.apiKey = process.env.KIMI_API_KEY;
    }

    await provider.initialize(providerConfig);
    this.currentProvider = provider;
  }

  /**
   * Auto-detect best available provider
   */
  private async autoDetectProvider(): Promise<ProviderType> {
    console.log('[DETECT] Finding best provider...');

    // 1. Check for API key (fastest, most reliable)
    if (process.env.KIMI_API_KEY) {
      const api = this.providers.get('api')!;
      try {
        await api.initialize({ type: 'api', apiKey: process.env.KIMI_API_KEY });
        const available = await api.isAvailable();
        if (available) {
          console.log('[OK] Using Kimi API');
          return 'api';
        }
      } catch {
        // Continue to next option
      }
    }

    // 2. Check for official CLI
    const cli = this.providers.get('cli')!;
    const cliAvailable = await cli.isAvailable();
    if (cliAvailable) {
      console.log('[OK] Using Kimi CLI');
      return 'cli';
    }

    // 3. Fall back to browser (subscription mode)
    console.log('[FALLBACK] Using Browser mode');
    console.log('           Requires login at kimi.moonshot.cn');
    return 'browser';
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
        name: 'Kimi API',
        description: 'Direct API connection. Requires KIMI_API_KEY.',
        requirements: ['KIMI_API_KEY environment variable'],
        isAvailable: !!process.env.KIMI_API_KEY,
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
