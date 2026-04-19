/**
 * OMK configuration loader.
 *
 * Precedence is intentionally simple:
 * CLI/explicit options > project .omk/config.toml > global ~/.omk/config.toml > env/defaults.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import TOML from '@iarna/toml';
import { ProviderConfig, ProviderType, ReasoningEffort } from './providers/types.js';

export interface OMKConfig {
  provider?: ProviderType;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  reasoning?: ReasoningEffort;
  headers?: Record<string, string>;
  providers?: Record<string, Partial<ProviderConfig>>;
  models?: Record<string, string>;
}

function readConfig(path: string): OMKConfig {
  if (!existsSync(path)) return {};
  try {
    const content = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
    return TOML.parse(content) as OMKConfig;
  } catch (err) {
    throw new Error(`Failed to parse config ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function mergeConfig(base: OMKConfig, override: OMKConfig): OMKConfig {
  return {
    ...base,
    ...override,
    headers: {
      ...(base.headers ?? {}),
      ...(override.headers ?? {}),
    },
    providers: {
      ...(base.providers ?? {}),
      ...(override.providers ?? {}),
    },
    models: {
      ...(base.models ?? {}),
      ...(override.models ?? {}),
    },
  };
}

function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function normalizeProviderOverride(config: Partial<ProviderConfig>): Partial<ProviderConfig> {
  const normalized = { ...config };
  const maybeKey = normalized.apiKeyEnv?.trim();

  if (maybeKey && /^(sk-|or-|pk-)/i.test(maybeKey)) {
    normalized.apiKey = maybeKey;
    delete normalized.apiKeyEnv;
  }

  return normalized;
}

export function loadOMKConfig(cwd: string = process.cwd()): OMKConfig {
  const globalPath = join(homedir(), '.omk', 'config.toml');
  const projectPath = join(cwd, '.omk', 'config.toml');
  return mergeConfig(readConfig(globalPath), readConfig(projectPath));
}

export function resolveProviderConfig(
  requested: Partial<ProviderConfig> = {},
  cwd: string = process.cwd()
): ProviderConfig {
  const fileConfig = loadOMKConfig(cwd);
  const cleanRequested = definedOnly(requested as Record<string, unknown>) as Partial<ProviderConfig>;
  const requestedType = cleanRequested.type ?? fileConfig.provider ?? 'auto';
  const providerOverride = normalizeProviderOverride(fileConfig.providers?.[requestedType] ?? {});
  const normalizedFileConfig = normalizeProviderOverride(fileConfig as Partial<ProviderConfig>);

  return {
    type: requestedType,
    reasoning: fileConfig.reasoning,
    model: fileConfig.model,
    apiKey: normalizedFileConfig.apiKey,
    baseUrl: normalizedFileConfig.baseUrl,
    apiKeyEnv: normalizedFileConfig.apiKeyEnv,
    ...providerOverride,
    ...cleanRequested,
    headers: {
      ...(fileConfig.headers ?? {}),
      ...(providerOverride.headers ?? {}),
      ...(cleanRequested.headers ?? {}),
    },
  };
}

export function parseHeaderFlags(values: string[] = []): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const raw of values) {
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return headers;
}
