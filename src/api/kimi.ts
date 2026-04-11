/**
 * Kimi API Client
 * Interface with Moonshot AI API
 */

import { env } from 'process';

// API Configuration
const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2-0711-preview';

// Types
export interface KimiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: KimiToolCall[];
  tool_call_id?: string;
}

export interface KimiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface KimiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface KimiCompletionOptions {
  model?: string;
  messages: KimiMessage[];
  tools?: KimiTool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high';
}

export interface KimiCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: KimiMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface KimiStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<KimiMessage>;
    finish_reason: string | null;
  }[];
}

// Error types
export class KimiAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'KimiAPIError';
  }
}

export class KimiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KimiConfigError';
  }
}

// Client class
export class KimiClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options?: { 
    apiKey?: string; 
    baseUrl?: string; 
    model?: string;
  }) {
    this.apiKey = options?.apiKey || env.KIMI_API_KEY || '';
    this.baseUrl = options?.baseUrl || env.KIMI_BASE_URL || DEFAULT_BASE_URL;
    this.defaultModel = options?.model || env.OMK_MODEL || DEFAULT_MODEL;

    if (!this.apiKey) {
      throw new KimiConfigError(
        'KIMI_API_KEY is required. Set it as an environment variable or pass it to the constructor.'
      );
    }
  }

  /**
   * Create a chat completion
   */
  async complete(options: KimiCompletionOptions): Promise<KimiCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: options.model || this.defaultModel,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new KimiAPIError(
        `API request failed: ${response.status} ${errorText}`,
        response.status,
        errorText
      );
    }

    return response.json() as Promise<KimiCompletionResponse>;
  }

  /**
   * Create a streaming chat completion
   */
  async *stream(options: KimiCompletionOptions): AsyncGenerator<KimiStreamChunk> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: options.model || this.defaultModel,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new KimiAPIError(
        `API request failed: ${response.status} ${errorText}`,
        response.status,
        errorText
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new KimiAPIError('Response body is not readable');
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
              const data = JSON.parse(trimmed.slice(6)) as KimiStreamChunk;
              yield data;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Simple chat helper
   */
  async chat(
    message: string, 
    options?: { 
      system?: string; 
      history?: KimiMessage[];
      model?: string;
    }
  ): Promise<string> {
    const messages: KimiMessage[] = [
      ...(options?.history || []),
    ];

    if (options?.system) {
      messages.unshift({ role: 'system', content: options.system });
    }

    messages.push({ role: 'user', content: message });

    const response = await this.complete({
      model: options?.model,
      messages,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * List available models
   */
  async listModels(): Promise<{ id: string; object: string; created: number; owned_by: string }[]> {
    const url = `${this.baseUrl}/models`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new KimiAPIError(
        `Failed to list models: ${response.status} ${errorText}`,
        response.status,
        errorText
      );
    }

    const data = await response.json() as { data: { id: string; object: string; created: number; owned_by: string }[] };
    return data.data;
  }
}

// Singleton instance for CLI use
let defaultClient: KimiClient | null = null;

export function getKimiClient(): KimiClient {
  if (!defaultClient) {
    defaultClient = new KimiClient();
  }
  return defaultClient;
}

export function resetKimiClient(): void {
  defaultClient = null;
}
