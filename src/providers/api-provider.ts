/**
 * OpenAI-compatible API provider.
 *
 * Presets:
 * - api/kimi: Moonshot Kimi-compatible defaults
 * - openrouter: OpenRouter defaults and attribution headers
 * - custom: user-supplied base URL/model/key env
 */

import {
  Provider,
  ProviderConfig,
  ProviderType,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolCall,
} from './types.js';

const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_KIMI_MODEL = 'kimi-k2-0711-preview';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseHeaders(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string])
    );
  } catch {
    return {};
  }
}

function firstEnv(...names: Array<string | undefined>): string | undefined {
  for (const name of names) {
    if (!name) continue;
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

export class APIProvider implements Provider {
  readonly type: ProviderType;
  readonly name: string;

  private config: ProviderConfig;

  constructor(type: Extract<ProviderType, 'api' | 'kimi' | 'openrouter' | 'custom'> = 'api') {
    this.type = type;
    this.name = type === 'openrouter'
      ? 'OpenRouter API'
      : type === 'custom'
        ? 'Custom OpenAI-compatible API'
        : 'OpenAI-compatible API';
    this.config = this.defaultConfig(type);
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = this.resolveConfig(config);

    if (!this.config.baseUrl) {
      throw new Error('API base URL is required. Set OMK_API_BASE_URL, CUSTOM_API_BASE_URL, or pass --base-url.');
    }
    if (!this.config.model) {
      throw new Error('API model is required. Set OMK_MODEL, OPENROUTER_MODEL, CUSTOM_API_MODEL, or pass --model.');
    }
    if (!this.config.apiKey) {
      throw new Error(
        `${this.name} API key not set.\n` +
        'Set one of: OMK_API_KEY, OPENROUTER_API_KEY, CUSTOM_API_KEY, KIMI_API_KEY, or configure apiKeyEnv.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey || !this.config.baseUrl) return false;

    if (this.type === 'custom') {
      return Boolean(this.config.model);
    }

    try {
      const response = await fetch(`${trimTrailingSlash(this.config.baseUrl)}/models`, {
        method: 'GET',
        headers: this.headers(),
        signal: timeoutSignal(this.config.timeout ?? 10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${trimTrailingSlash(this.config.baseUrl!)}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, false)),
      signal: timeoutSignal(this.config.timeout ?? 600000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: { content?: string | null; tool_calls?: ToolCall[] };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const choice = data.choices[0];
    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls,
      finishReason: choice?.finish_reason,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
    };
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${trimTrailingSlash(this.config.baseUrl!)}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options, true)),
      signal: timeoutSignal(this.config.timeout ?? 600000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as {
                choices?: Array<{ delta?: { content?: string | null } }>;
              };
              const content = data.choices?.[0]?.delta?.content ?? '';
              if (content) {
                yield { content, done: false };
              }
            } catch {
              // Skip invalid SSE fragments.
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
  }

  async disconnect(): Promise<void> {
    // API mode has no persistent connection.
  }

  private defaultConfig(type: ProviderType): ProviderConfig {
    if (type === 'openrouter') {
      return {
        type,
        baseUrl: DEFAULT_OPENROUTER_BASE_URL,
        model: DEFAULT_OPENROUTER_MODEL,
        timeout: 600000,
      };
    }

    if (type === 'custom') {
      return {
        type,
        timeout: 600000,
      };
    }

    return {
      type,
      baseUrl: DEFAULT_KIMI_BASE_URL,
      model: DEFAULT_KIMI_MODEL,
      timeout: 600000,
    };
  }

  private resolveConfig(config: ProviderConfig): ProviderConfig {
    const type = config.type === 'api' ? this.type : config.type;
    const defaults = this.defaultConfig(type);

    const envHeaders = {
      ...parseHeaders(process.env.OMK_API_HEADERS),
      ...parseHeaders(process.env.CUSTOM_API_HEADERS),
    };

    const baseUrl = config.baseUrl ??
      (type === 'openrouter'
        ? firstEnv('OPENROUTER_BASE_URL', 'OMK_API_BASE_URL')
        : type === 'custom'
          ? firstEnv('CUSTOM_API_BASE_URL', 'OMK_API_BASE_URL')
          : firstEnv('OMK_API_BASE_URL', 'KIMI_BASE_URL')) ??
      defaults.baseUrl;

    const model = config.model ??
      (type === 'openrouter'
        ? firstEnv('OPENROUTER_MODEL', 'OMK_MODEL')
        : type === 'custom'
          ? firstEnv('CUSTOM_API_MODEL', 'OMK_MODEL')
          : firstEnv('OMK_MODEL', 'KIMI_MODEL')) ??
      defaults.model;

    const apiKey = config.apiKey ??
      firstEnv(config.apiKeyEnv) ??
      (type === 'openrouter'
        ? firstEnv('OPENROUTER_API_KEY', 'OMK_API_KEY')
        : type === 'custom'
          ? firstEnv('CUSTOM_API_KEY', 'OMK_API_KEY')
          : firstEnv('OMK_API_KEY', 'KIMI_API_KEY'));

    const headers: Record<string, string> = {
      ...envHeaders,
      ...(config.headers ?? {}),
    };

    if (type === 'openrouter') {
      const siteUrl = config.siteUrl ?? process.env.OPENROUTER_SITE_URL;
      const appName = config.appName ?? process.env.OPENROUTER_APP_NAME ?? 'OMK CLI';
      if (siteUrl) headers['HTTP-Referer'] = siteUrl;
      if (appName) headers['X-Title'] = appName;
    }

    return {
      ...defaults,
      ...config,
      type,
      baseUrl,
      model,
      apiKey,
      headers,
    };
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...(this.config.headers ?? {}),
    };
  }

  private buildBody(options: ChatOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    };

    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? 'auto';
    }

    const reasoning = options.reasoning ?? this.config.reasoning;
    if (reasoning && reasoning !== 'medium') {
      body.reasoning_effort = reasoning;
    }

    return body;
  }
}
