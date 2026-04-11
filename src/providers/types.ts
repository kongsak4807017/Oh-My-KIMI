/**
 * Provider Types for OMK
 * Supports multiple Kimi connection methods
 */

export type ProviderType = 'api' | 'browser' | 'cli' | 'auto';

export interface ProviderConfig {
  type: ProviderType;
  // API mode
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  // Browser mode
  headless?: boolean;
  browserType?: 'chromium' | 'firefox' | 'webkit';
  // CLI mode
  cliPath?: string;
  // Common
  timeout?: number;
  reasoning?: 'low' | 'medium' | 'high';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  reasoning?: 'low' | 'medium' | 'high';
}

export interface ChatResponse {
  content: string;
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
