/**
 * Provider Types for OMK.
 * API providers are OpenAI-compatible by default, with presets for Kimi,
 * OpenRouter, and user-supplied custom gateways.
 */

export type ProviderType =
  | 'api'
  | 'kimi'
  | 'openrouter'
  | 'custom'
  | 'browser'
  | 'cli'
  | 'kimi-cli'
  | 'gemini-cli'
  | 'codex-cli'
  | 'auto';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ProviderConfig {
  type: ProviderType;
  // API mode (OpenAI-compatible)
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
  siteUrl?: string;
  appName?: string;
  providerName?: string;
  // Browser mode
  headless?: boolean;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  // CLI mode
  cliPath?: string;
  cliArgs?: string[];
  // Common
  timeout?: number;
  reasoning?: ReasoningEffort;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  reasoning?: ReasoningEffort;
  model?: string;
  tools?: ChatTool[];
  toolChoice?: 'auto' | 'none' | Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface Provider {
  readonly name: string;
  readonly type: ProviderType;
  
  initialize(config: ProviderConfig): Promise<void>;
  chat(options: ChatOptions): Promise<ChatResponse>;
  stream(options: ChatOptions): AsyncGenerator<StreamChunk>;
  isAvailable(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  description: string;
  requirements: string[];
  isAvailable: boolean;
}
