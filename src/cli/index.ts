/**
 * OMK CLI
 * Provider-backed multi-agent orchestration
 */

import React from 'react';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import TOML from '@iarna/toml';
import {
  buildSkillSystemPrompt,
  copySkillTree,
  detectSkillInvocations,
  getWorkspaceAgentsContent,
  isActionableAgentRequest,
  listAvailableSkills,
  loadSkillContent,
  stripCliFlags,
} from '../skills/runtime.js';
import { launchPassthrough, launchInteractiveShell } from './passthrough.js';
import { loadOMKConfig, parseHeaderFlags, resolveProviderConfig } from '../config.js';
import { getProviderManager } from '../providers/manager.js';
import { runModelToolLoop } from '../orchestration/model-runner.js';

// Types
export type CliCommand = 
  | "launch"
  | "setup"
  | "doctor"
  | "uninstall"
  | "ralph"
  | "team"
  | "plan"
  | "deep-interview"
  | "autopilot"
  | "cancel"
  | "config"
  | "help"
  | "version"
  | string;

// Constants
const HELP = `
OMK (omk) - provider-backed multi-agent orchestration

Usage:
  omk                    Launch OMK interactive session
  omk --tui              Launch TUI mode (full UI with agents panel)
  omk --passthrough      Run Kimi CLI directly with OMK context (no HUD)
  omk --shell            Launch native Kimi CLI interactive shell
  omk setup              Install skills, prompts, and AGENTS.md scaffolding
  omk doctor             Check installation health
  omk uninstall          Remove OMK configuration
  omk ralph "<task>"     Start persistent completion loop
  omk team "<task>"      Start coordinated team execution
  omk plan "<task>"      Create implementation plan
  omk deep-interview     Socratic requirements clarification
  omk autopilot "<task>" Full autonomous pipeline
  omk cancel             Cancel active execution modes
  omk config             Show effective provider config
  omk config init <type> Write provider config (openrouter, custom, api, kimi, kimi-cli, gemini-cli, codex-cli)
  omk use custom         Select and configure a provider profile
  omk model <model>      Change the configured model
  omk "<prompt>"         Run one-shot prompt and print the response
  omk help               Show this help message
  omk version            Show version information

Options:
  --provider <type>      Provider: api, kimi, openrouter, custom, browser, cli, kimi-cli, gemini-cli, codex-cli, auto
  --api                  Shortcut for --provider=api
  --openrouter           Shortcut for --provider=openrouter
  --custom               Shortcut for --provider=custom
  --browser              Shortcut for --provider=browser (uses subscription)
  --cli                  Shortcut for --provider=cli
  --kimi-cli             Shortcut for --provider=kimi-cli
  --gemini-cli           Shortcut for --provider=gemini-cli
  --codex-cli            Shortcut for --provider=codex-cli
  --base-url <url>       Override API base URL
  --api-key <key>        Store API key directly in config (prefer --api-key-env for real secrets)
  --api-key-env <name>   Read API key from a specific environment variable
  --header <k=v>         Add API header (repeatable)
  --global               Write global config for config commands
  --high                 Use high reasoning effort
  --yolo                 Bypass confirmations (dangerous)
  --tui                  Use TUI mode (full terminal UI)
  --passthrough          Run Kimi CLI directly with OMK context (no HUD/wrapper)
  --shell                Launch native Kimi CLI interactive shell
  --force                Force reinstall
  --dry-run              Show what would be done
  --verbose              Show detailed output

Environment Variables:
  OMK_API_KEY            Generic OpenAI-compatible API key
  OMK_API_BASE_URL       Generic API base URL
  OMK_MODEL              Default model
  OPENROUTER_API_KEY     OpenRouter API key
  OPENROUTER_MODEL       OpenRouter model (for example openai/gpt-4o-mini)
  CUSTOM_API_KEY         Custom OpenAI-compatible API key
  CUSTOM_API_BASE_URL    Custom API base URL
  CUSTOM_API_MODEL       Custom API model
  KIMI_API_KEY           Backwards-compatible Moonshot/Kimi API key

Provider Modes:
  api                    Use generic OpenAI-compatible API
  kimi                   Use Kimi/Moonshot API preset
  openrouter             Use OpenRouter
  custom                 Use custom OpenAI-compatible API
  browser                Use Kimi web interface (uses your subscription, free!)
  cli                    Backward-compatible Kimi CLI OAuth alias
  kimi-cli               Use authenticated Kimi CLI OAuth/session
  gemini-cli             Use authenticated Gemini CLI OAuth/session
  codex-cli              Use authenticated Codex CLI OAuth/session
  auto                   Auto-detect best available (default)

TUI Mode Hotkeys:
  Ctrl+X                 Toggle mode (chat/plan/agent)
  Shift+Tab              Toggle agents panel
  Ctrl+C                 Exit
`;

const VERSION = "0.2.0";
const OMK_DIR = '.omk';
const OMK_CONFIG_DIR = join(homedir(), '.omk');

// Utility functions
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function getProjectRoot(): string {
  return process.cwd();
}

function getOmkPath(): string {
  return join(getProjectRoot(), OMK_DIR);
}

function getGlobalOmkPath(): string {
  return OMK_CONFIG_DIR;
}

function getConfigPath(global: boolean): string {
  return global
    ? join(getGlobalOmkPath(), 'config.toml')
    : join(getOmkPath(), 'config.toml');
}

function readConfigForWrite(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  return TOML.parse(readFileSync(path, 'utf-8')) as Record<string, any>;
}

function writeConfig(path: string, config: Record<string, any>): void {
  ensureDir(dirname(path));
  writeFileSync(path, TOML.stringify(config as any));
}

function setNestedValue(target: Record<string, any>, key: string, value: string): void {
  const parts = key.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Config key is required');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function getNestedValue(target: Record<string, any>, key: string): unknown {
  let cursor: any = target;
  for (const part of key.split('.').filter(Boolean)) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function redactConfig(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactConfig(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/apiKey|api_key|token|secret|password/i.test(key) && typeof child === 'string' && child) {
      result[key] = '[redacted]';
    } else {
      result[key] = redactConfig(child);
    }
  }
  return result;
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

/**
 * Get effective OMK path - prefers local, falls back to global
 */
function getEffectiveOmkPath(): string {
  const localPath = getOmkPath();
  if (existsSync(localPath)) {
    return localPath;
  }
  const globalPath = getGlobalOmkPath();
  ensureDir(globalPath);
  return globalPath;
}

/**
 * Get AGENTS.md path - prefers local, falls back to global
 */
function getAgentsPath(): string {
  const localPath = join(getProjectRoot(), 'AGENTS.md');
  if (existsSync(localPath)) {
    return localPath;
  }
  const globalPath = join(getGlobalOmkPath(), 'AGENTS.md');
  if (existsSync(globalPath)) {
    return globalPath;
  }
  return localPath; // Return local path anyway (will fail gracefully)
}

/**
 * Check if running with global fallback
 */
function isUsingGlobalFallback(): boolean {
  return !existsSync(getOmkPath()) && existsSync(getGlobalOmkPath());
}

// Setup command
async function setup(options: { force: boolean; dryRun: boolean; verbose: boolean }): Promise<void> {
  const cwd = getProjectRoot();
  const omkPath = getOmkPath();
  
  if (options.dryRun) {
    console.log('[DRY RUN] Would create:', omkPath);
    return;
  }

  // Create .omk directory structure
  const dirs = [
    omkPath,
    join(omkPath, 'skills'),
    join(omkPath, 'state'),
    join(omkPath, 'plans'),
    join(omkPath, 'logs'),
    join(omkPath, 'context'),
    join(omkPath, 'interviews'),
    join(omkPath, 'specs'),
    join(omkPath, 'sessions'),
    join(omkPath, 'artifacts'),
  ];

  for (const dir of dirs) {
    ensureDir(dir);
    if (options.verbose) {
      console.log(`Created: ${dir}`);
    }
  }

  // Copy built-in skills
  const pkgRoot = getPackageRoot();
  const builtinSkillsSrc = join(pkgRoot, 'skills');
  const builtinSkillsDst = join(omkPath, 'skills');

  if (existsSync(builtinSkillsSrc)) {
    copySkillTree(builtinSkillsSrc, builtinSkillsDst, options.force);
    if (options.verbose) {
      console.log(`Copied skills: ${builtinSkillsSrc} -> ${builtinSkillsDst}`);
    }
  }

  // Create AGENTS.md if it doesn't exist
  const agentsPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsPath) || options.force) {
    const agentsTemplate = generateAgentsTemplate();
    if (!options.dryRun) {
      writeFileSync(agentsPath, agentsTemplate);
      console.log(`Created: ${agentsPath}`);
    }
  }

  // Create .gitignore entry
  const gitignorePath = join(cwd, '.gitignore');
  const omkEntry = `${OMK_DIR}/`;
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(omkEntry)) {
      writeFileSync(gitignorePath, content + '\n' + omkEntry + '\n');
      console.log(`Updated: ${gitignorePath}`);
    }
  }

  console.log('\nOMK setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Set an API key or login to a supported CLI (codex login, gemini, or kimi login)');
  console.log('  2. Run: omk --provider openrouter --model <provider/model>');
  console.log('     Or: omk --codex-cli, omk --gemini-cli, or omk --kimi-cli');
  console.log('  3. Try: $ralph "your task here"');
}

function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), '..', '..');
}

function generateAgentsTemplate(): string {
  const pkgRoot = getPackageRoot();
  const templatePath = join(pkgRoot, 'templates', 'AGENTS.md');
  const template = existsSync(templatePath)
    ? readFileSync(templatePath, 'utf-8')
    : '# OMK Project\n';

  return template.replaceAll('{{PROJECT_NAME}}', basename(getProjectRoot()));
}

// Doctor command
async function doctor(): Promise<void> {
  console.log('Running OMK health check...\n');
  
  const checks: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion >= 20) {
    checks.push({ name: 'Node.js', status: 'ok', message: nodeVersion });
  } else {
    checks.push({ name: 'Node.js', status: 'error', message: `${nodeVersion} (requires >=20)` });
  }

  // Check API keys
  if (process.env.OPENROUTER_API_KEY || process.env.OMK_API_KEY || process.env.CUSTOM_API_KEY || process.env.KIMI_API_KEY) {
    checks.push({ name: 'API Key', status: 'ok', message: 'At least one provider key is set' });
  } else {
    checks.push({ name: 'API Key', status: 'warn', message: 'No API key set - OAuth CLI providers may still work' });
  }

  const cliChecks = [
    { name: 'Codex CLI OAuth', command: 'codex', login: 'codex login' },
    { name: 'Gemini CLI OAuth', command: 'gemini', login: 'gemini' },
    { name: 'Kimi CLI OAuth', command: 'kimi', login: 'kimi login' },
  ];
  const installedCli = cliChecks.filter(item => commandExists(item.command));
  if (installedCli.length > 0) {
    checks.push({
      name: 'OAuth CLI Providers',
      status: 'ok',
      message: installedCli.map(item => item.command).join(', '),
    });
  } else {
    checks.push({
      name: 'OAuth CLI Providers',
      status: 'warn',
      message: `None found - install/login with ${cliChecks.map(item => item.login).join(', ')}`,
    });
  }

  // Check .omk directory
  const omkPath = getOmkPath();
  if (existsSync(omkPath)) {
    checks.push({ name: 'OMK Directory', status: 'ok', message: omkPath });
  } else {
    checks.push({ name: 'OMK Directory', status: 'warn', message: 'Not initialized - run: omk setup' });
  }

  // Check AGENTS.md
  const agentsPath = join(getProjectRoot(), 'AGENTS.md');
  if (existsSync(agentsPath)) {
    checks.push({ name: 'AGENTS.md', status: 'ok', message: 'Found' });
  } else {
    checks.push({ name: 'AGENTS.md', status: 'warn', message: 'Not found - run: omk setup' });
  }

  // Print results
  for (const check of checks) {
    const icon = check.status === 'ok' ? '[OK]' : check.status === 'warn' ? '[WARN]' : '[ERR]';
    console.log(`${icon} ${check.name}: ${check.message}`);
  }

  console.log('\nSummary:');
  const errors = checks.filter(c => c.status === 'error').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  
  if (errors === 0 && warns === 0) {
    console.log('All checks passed! OMK is ready to use.');
  } else if (errors === 0) {
    console.log(`${warns} warning(s) found. OMK should work but some features may be limited.`);
  } else {
    console.log(`${errors} error(s) and ${warns} warning(s) found. Please fix errors before using OMK.`);
    process.exit(1);
  }
}

// Uninstall command
async function uninstall(options: { dryRun: boolean; verbose: boolean }): Promise<void> {
  const omkPath = getOmkPath();
  
  if (options.dryRun) {
    console.log('[DRY RUN] Would remove:', omkPath);
    return;
  }

  if (existsSync(omkPath)) {
    rmSync(omkPath, { recursive: true });
    console.log(`Removed: ${omkPath}`);
  }

  console.log('\\n[OK] OMK uninstalled.');
}

// Version command
function version(): void {
  console.log(`omk v${VERSION}`);
}

async function configCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const global = args.includes('--global');
  const cleaned = stripCliFlags(args).filter(arg => arg !== '--global');
  const action = cleaned[0] ?? 'show';
  const configPath = getConfigPath(global);

  if (action === 'path') {
    console.log(configPath);
    return;
  }

  if (action === 'show') {
    const effective = loadOMKConfig(process.cwd());
    const resolved = resolveProviderConfig({
      type: flags.provider as any,
      model: flags.model,
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      apiKeyEnv: flags.apiKeyEnv,
      headers: flags.headers,
    }, process.cwd());

    console.log('Effective config:');
    console.log(TOML.stringify(redactConfig(effective) as any).trim() || '(empty)');
    console.log('\nResolved provider:');
    console.log(JSON.stringify({
      type: resolved.type,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      apiKeyEnv: resolved.apiKeyEnv,
      cliPath: resolved.cliPath,
      cliArgs: resolved.cliArgs,
      headers: resolved.headers,
      hasApiKey: Boolean(resolved.apiKey),
    }, null, 2));
    return;
  }

  if (action === 'get') {
    const key = cleaned[1];
    if (!key) throw new Error('Usage: omk config get <key>');
    const value = getNestedValue(loadOMKConfig(process.cwd()) as any, key);
    console.log(value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    return;
  }

  if (action === 'set') {
    const key = cleaned[1];
    const value = cleaned.slice(2).join(' ');
    if (!key || !value) throw new Error('Usage: omk config set <key> <value> [--global]');
    const config = readConfigForWrite(configPath);
    setNestedValue(config, key, value);
    writeConfig(configPath, config);
    console.log(`Wrote ${key} to ${configPath}`);
    return;
  }

  if (action === 'init') {
    const provider = cleaned[1] ?? flags.provider ?? 'openrouter';
    const config = readConfigForWrite(configPath);
    config.provider = provider;
    if (flags.reasoning) config.reasoning = flags.reasoning;
    config.providers ??= {};
    config.providers[provider] ??= {};

    const providerConfig = config.providers[provider];
    if (flags.model) {
      config.model = flags.model;
      providerConfig.model = flags.model;
    }
    if (flags.baseUrl) providerConfig.baseUrl = flags.baseUrl;
    if (flags.apiKey) {
      providerConfig.apiKey = flags.apiKey;
      delete providerConfig.apiKeyEnv;
    }
    if (flags.apiKeyEnv) providerConfig.apiKeyEnv = flags.apiKeyEnv;
    if (flags.headers && Object.keys(flags.headers).length > 0) {
      providerConfig.headers = {
        ...(providerConfig.headers ?? {}),
        ...flags.headers,
      };
    }

    if (provider === 'openrouter') {
      providerConfig.baseUrl ??= 'https://openrouter.ai/api/v1';
      if (!providerConfig.apiKey) providerConfig.apiKeyEnv ??= 'OPENROUTER_API_KEY';
      providerConfig.model ??= flags.model ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
      config.model ??= providerConfig.model;
    } else if (provider === 'custom') {
      providerConfig.baseUrl ??= flags.baseUrl ?? process.env.CUSTOM_API_BASE_URL ?? 'http://localhost:1234/v1';
      if (!providerConfig.apiKey) providerConfig.apiKeyEnv ??= flags.apiKeyEnv ?? 'CUSTOM_API_KEY';
      providerConfig.model ??= flags.model ?? process.env.CUSTOM_API_MODEL ?? 'local-model';
      config.model ??= providerConfig.model;
    } else if (provider === 'kimi') {
      providerConfig.baseUrl ??= 'https://api.moonshot.cn/v1';
      if (!providerConfig.apiKey) providerConfig.apiKeyEnv ??= 'KIMI_API_KEY';
      providerConfig.model ??= flags.model ?? process.env.KIMI_MODEL ?? 'kimi-k2-0711-preview';
      config.model ??= providerConfig.model;
    } else if (provider === 'api') {
      if (!providerConfig.apiKey) providerConfig.apiKeyEnv ??= flags.apiKeyEnv ?? 'OMK_API_KEY';
      if (flags.baseUrl) providerConfig.baseUrl = flags.baseUrl;
      if (flags.model) providerConfig.model = flags.model;
    } else if (provider === 'cli' || provider === 'kimi-cli') {
      providerConfig.cliPath ??= 'kimi';
      if (flags.model) providerConfig.model = flags.model;
    } else if (provider === 'gemini-cli') {
      providerConfig.cliPath ??= 'gemini';
      if (flags.model) providerConfig.model = flags.model;
    } else if (provider === 'codex-cli') {
      providerConfig.cliPath ??= 'codex';
      if (flags.model) providerConfig.model = flags.model;
    } else {
      throw new Error(`Unsupported config init provider: ${provider}`);
    }

    writeConfig(configPath, config);
    console.log(`Wrote ${provider} config to ${configPath}`);
    if (providerConfig.apiKeyEnv) {
      console.log(`Set ${providerConfig.apiKeyEnv} in your environment before running OMK.`);
    } else if (providerConfig.apiKey) {
      console.log('Stored apiKey directly in config. Prefer --api-key-env for real secrets.');
    } else if (provider.endsWith('-cli') || provider === 'cli') {
      console.log('OMK will reuse the native CLI OAuth/session. Make sure that CLI is logged in.');
    }
    return;
  }

  throw new Error(`Unknown config action: ${action}`);
}

async function useCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const cleaned = stripCliFlags(args).filter(arg => arg !== '--global');
  const provider = cleaned[0] ?? 'show';

  if (provider === 'show' || provider === 'status') {
    await configCommand(['show', ...args]);
    return;
  }

  const supported = new Set(['openrouter', 'custom', 'api', 'kimi', 'cli', 'kimi-cli', 'gemini-cli', 'codex-cli']);
  if (!supported.has(provider)) {
    throw new Error(`Unsupported provider: ${provider}. Use one of: ${Array.from(supported).join(', ')}`);
  }

  const forwarded = ['init', provider, ...args.slice(1)];
  await configCommand(forwarded);

  const effective = resolveProviderConfig({
    type: provider as any,
    model: flags.model,
    baseUrl: flags.baseUrl,
    apiKey: flags.apiKey,
    apiKeyEnv: flags.apiKeyEnv,
    headers: flags.headers,
  }, process.cwd());

  console.log('\nSelected provider:');
  console.log(`  provider: ${effective.type}`);
  console.log(`  model: ${effective.model ?? '(not set)'}`);
  console.log(`  baseUrl: ${effective.baseUrl ?? '(not needed)'}`);
  console.log(`  apiKey: ${effective.apiKey ? '[stored]' : effective.apiKeyEnv ? `$${effective.apiKeyEnv}` : '(not set)'}`);
  console.log('\nRun with: omk --custom "your task"');
}

async function modelCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const global = args.includes('--global');
  const cleaned = stripCliFlags(args).filter(arg => arg !== '--global');
  const action = cleaned[0] ?? 'show';

  if (action === 'show' || action === 'status') {
    const resolved = resolveProviderConfig({
      type: flags.provider as any,
      model: flags.model,
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      apiKeyEnv: flags.apiKeyEnv,
      headers: flags.headers,
    }, process.cwd());
    console.log(`Provider: ${resolved.type}`);
    console.log(`Model: ${resolved.model ?? '(not set)'}`);
    console.log(`Base URL: ${resolved.baseUrl ?? '(not needed)'}`);
    return;
  }

  const model = action === 'set'
    ? cleaned.slice(1).join(' ').trim()
    : cleaned.join(' ').trim();

  if (!model) {
    throw new Error('Usage: omk model <model> [--provider custom] [--global]');
  }

  const configPath = getConfigPath(global);
  const config = readConfigForWrite(configPath);
  const provider = flags.provider ?? config.provider ?? 'custom';
  config.provider ??= provider;
  config.model = model;
  config.providers ??= {};
  config.providers[provider] ??= {};
  config.providers[provider].model = model;

  writeConfig(configPath, config);
  console.log(`Updated ${provider} model in ${configPath}`);
  console.log(`Model: ${model}`);
}

async function oneShot(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const prompt = stripCliFlags(args).join(' ').trim();
  if (!prompt) throw new Error('Usage: omk "<prompt>" [--openrouter|--custom|--provider <type>]');

  const detectedSkills = detectSkillInvocations(prompt)
    .filter(match => loadSkillContent(process.cwd(), match.skillName));
  if (detectedSkills.length > 0) {
    await invokeSkill(detectedSkills[0].skillName, args);
    return;
  }

  const providerManager = getProviderManager();
  await providerManager.initialize({
    type: (flags.provider as any) || 'auto',
    model: flags.model,
    baseUrl: flags.baseUrl,
    apiKey: flags.apiKey,
    apiKeyEnv: flags.apiKeyEnv,
    headers: flags.headers,
    reasoning: (flags.reasoning as any) || 'medium',
  });

  const provider = providerManager.getProvider();
  const agentsContent = getWorkspaceAgentsContent(process.cwd());
  const systemPrompt = [
    'You are OMK, a provider-backed autonomous coding agent and orchestrator.',
    'When the user asks about this workspace or asks you to do work, use tools and report evidence.',
    agentsContent.trim() ? `Workspace instructions:\n${agentsContent.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  if (isActionableAgentRequest(prompt)) {
    const result = await runModelToolLoop([
      'One-shot OMK request:',
      prompt,
      '',
      'Execute this as real agent work when possible. Inspect the workspace before making workspace-specific claims. End with a concise evidence summary.',
    ].join('\n'), process.cwd(), {
      provider: flags.provider as any,
      model: flags.model,
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      apiKeyEnv: flags.apiKeyEnv,
      headers: flags.headers,
      reasoning: flags.reasoning || 'medium',
      yolo: flags.yolo,
    }, {
      maxIterations: 6,
      showEvidence: true,
      systemPrompt,
    });

    if (!result.stdout.trim()) {
      console.error('No response content returned by provider. Check model/provider config with: omk config show');
      process.exitCode = 1;
    }
    return;
  }

  let output = '';

  for await (const chunk of provider.stream({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    model: flags.model,
    reasoning: flags.reasoning as any,
  })) {
    if (chunk.content) {
      process.stdout.write(chunk.content);
      output += chunk.content;
    }
    if (chunk.done) break;
  }

  if (!output.trim()) {
    const response = await provider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      model: flags.model,
      reasoning: flags.reasoning as any,
    });
    output = response.content || '';
    if (output) process.stdout.write(output);
  }

  if (!output.trim()) {
    console.error('No response content returned by provider. Check model/provider config with: omk config show');
    process.exitCode = 1;
  } else if (!output.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

// Launch command (main entry)
async function launch(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  
  if (flags.provider === 'openrouter' && !process.env.OPENROUTER_API_KEY && !flags.apiKey && !flags.apiKeyEnv) {
    console.error('Error: OPENROUTER_API_KEY required for OpenRouter mode');
    console.error('   Set it with: export OPENROUTER_API_KEY=your_key');
    process.exit(1);
  }

  if (flags.provider === 'custom' && !process.env.CUSTOM_API_KEY && !process.env.OMK_API_KEY && !flags.apiKey && !flags.apiKeyEnv) {
    console.error('Error: CUSTOM_API_KEY or OMK_API_KEY required for custom API mode');
    console.error('   Also set CUSTOM_API_BASE_URL and CUSTOM_API_MODEL, or pass --base-url and --model');
    process.exit(1);
  }

  // Check prerequisites based on provider
  if (flags.provider === 'kimi' && !process.env.KIMI_API_KEY) {
    console.error('Error: KIMI_API_KEY required for Kimi preset mode');
    console.error('   Set it with: export KIMI_API_KEY=your_key');
    console.error('   Or use: omk --browser (subscription mode, free!)');
    process.exit(1);
  }
  
  console.log('>> Launching OMK...');
  
  // Show Root Agent status
  if (isUsingGlobalFallback()) {
    console.log('[GLOBAL] Root Agent active (no project setup needed)');
  }
  
  console.log(`Provider: ${flags.provider || 'auto'}`);
  console.log(`Reasoning: ${flags.reasoning || 'medium'}`);
  
  if (flags.yolo) {
    console.log('[WARNING] YOLO mode enabled - bypassing confirmations');
  }
  
  // Show provider hint
  if (!flags.provider || flags.provider === 'auto') {
    const resolved = resolveProviderConfig({
      type: (flags.provider as any) || undefined,
      model: flags.model,
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      apiKeyEnv: flags.apiKeyEnv,
      headers: flags.headers,
    }, process.cwd());

    if (!resolved.apiKey && !process.env.OPENROUTER_API_KEY && !process.env.OMK_API_KEY && !process.env.CUSTOM_API_KEY && !process.env.KIMI_API_KEY) {
      console.log('\n[INFO] No API key found. Configure an API provider first.');
      console.log('       Run: omk config init openrouter --global --model <provider/model>');
      console.log('       Or reuse OAuth from a native CLI: omk --codex-cli, omk --gemini-cli, or omk --kimi-cli');
    }
  }

  // Check for passthrough mode (native Kimi CLI experience)
  if (args.includes('--passthrough') || args.includes('--raw')) {
    await launchPassthrough(args);
    return;
  }
  if (args.includes('--shell')) {
    await launchInteractiveShell();
    return;
  }

  // Check for TUI mode.
  const useTUI = args.includes('--tui');
  
  if (useTUI) {
    await launchTUI(flags);
  } else {
    // Start Kimi-style REPL (raw terminal UI with streaming, status bar, multi-line input)
    const { startKimiREPL } = await import('../repl/index.js');
    await startKimiREPL(process.cwd(), {
      provider: flags.provider,
      reasoning: flags.reasoning,
      yolo: flags.yolo,
      model: flags.model,
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      apiKeyEnv: flags.apiKeyEnv,
      headers: flags.headers,
    });
  }
}

// TUI Launcher
async function launchTUI(flags: ReturnType<typeof parseFlags>): Promise<void> {
  const { render } = await import('ink');
  const { OMKApp } = await import('../tui/app.js');
  const { getProviderManager } = await import('../providers/manager.js');
  
  const providerManager = getProviderManager();
  
  // Initialize provider
  try {
    await providerManager.initialize({
      type: (flags.provider as any) || 'auto',
      reasoning: (flags.reasoning as 'low' | 'medium' | 'high') || 'medium',
      model: (flags as any).model,
      baseUrl: (flags as any).baseUrl,
      apiKey: (flags as any).apiKey,
      apiKeyEnv: (flags as any).apiKeyEnv,
      headers: (flags as any).headers,
    });
  } catch (err) {
    console.error('Failed to initialize provider:', err);
    process.exit(1);
  }
  
  // Clear screen
  console.clear();
  
  // Render TUI
  render(
    React.createElement(OMKApp, {
      cwd: process.cwd(),
      providerManager,
      reasoning: (flags.reasoning as 'low' | 'medium' | 'high') || 'medium',
      model: flags.model,
      yolo: flags.yolo,
    })
  );
}

function parseFlags(args: string[]): { 
  yolo?: boolean; 
  high?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  reasoning?: string;
  provider?: string;
  global?: boolean;
} {
  const flags: {
    yolo?: boolean;
    high?: boolean;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
    reasoning?: string;
    provider?: string;
    global?: boolean;
  } = {};
  const headerValues: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--yolo') {
      flags.yolo = true;
    } else if (arg === '--global') {
      flags.global = true;
    } else if (arg === '--high') {
      flags.high = true;
      flags.reasoning = 'high';
    } else if (arg === '--reasoning' && args[i + 1]) {
      flags.reasoning = args[i + 1];
      i++;
    } else if (arg === '--provider' && args[i + 1]) {
      flags.provider = args[i + 1];
      i++;
    } else if (arg === '--api') {
      flags.provider = 'api';
    } else if (arg === '--kimi') {
      flags.provider = 'kimi';
    } else if (arg === '--openrouter') {
      flags.provider = 'openrouter';
    } else if (arg === '--custom') {
      flags.provider = 'custom';
    } else if (arg === '--browser') {
      flags.provider = 'browser';
    } else if (arg === '--cli') {
      flags.provider = 'cli';
    } else if (arg === '--kimi-cli') {
      flags.provider = 'kimi-cli';
    } else if (arg === '--gemini-cli') {
      flags.provider = 'gemini-cli';
    } else if (arg === '--codex-cli') {
      flags.provider = 'codex-cli';
    } else if (arg === '--model' && args[i + 1]) {
      flags.model = args[i + 1];
      i++;
    } else if (arg === '--base-url' && args[i + 1]) {
      flags.baseUrl = args[i + 1];
      i++;
    } else if (arg === '--api-key' && args[i + 1]) {
      flags.apiKey = args[i + 1];
      i++;
    } else if (arg === '--api-key-env' && args[i + 1]) {
      flags.apiKeyEnv = args[i + 1];
      i++;
    } else if (arg === '--header' && args[i + 1]) {
      headerValues.push(args[i + 1]);
      i++;
    }
  }

  if (headerValues.length > 0) {
    flags.headers = parseHeaderFlags(headerValues);
  }
  
  return flags;
}

// Skill invocations
async function invokeSkill(skillName: string, args: string[]): Promise<void> {
  const resolvedSkill = loadSkillContent(process.cwd(), skillName);

  if (!resolvedSkill) {
    console.error(`Skill not found: ${skillName}`);
    const availableSkills = listAvailableSkills(process.cwd());
    if (availableSkills.length > 0) {
      console.log(`Available skills: ${availableSkills.join(', ')}`);
    }
    process.exit(1);
  }

  const providerFlags = parseFlags(args);
  const userInput = stripCliFlags(args).join(' ').trim();

  console.log(`Activating skill: ${resolvedSkill.skillName}`);
  console.log(`   Source: ${resolvedSkill.source}`);

  const engineSkills = new Set([
    'ralph', 'team', 'ultrawork', 'swarm', 'ultraqa',
    'pipeline', 'autopilot', 'plan', 'ralplan', 'deep-interview',
  ]);

  if (engineSkills.has(resolvedSkill.skillName)) {
    const { runEngine } = await import('../orchestration/index.js');
    await runEngine(resolvedSkill.skillName, userInput ? [userInput] : [], process.cwd(), {
      provider: providerFlags.provider as any,
      model: providerFlags.model,
      baseUrl: providerFlags.baseUrl,
      apiKey: providerFlags.apiKey,
      apiKeyEnv: providerFlags.apiKeyEnv,
      headers: providerFlags.headers,
      reasoning: providerFlags.reasoning || 'medium',
      yolo: providerFlags.yolo,
    });
    return;
  }

  const { getProviderManager } = await import('../providers/manager.js');
  const providerManager = getProviderManager();

  await providerManager.initialize({
    type: (providerFlags.provider as any) || 'auto',
    reasoning: (providerFlags.reasoning as 'low' | 'medium' | 'high') || 'medium',
    model: providerFlags.model,
    baseUrl: providerFlags.baseUrl,
    apiKey: providerFlags.apiKey,
    apiKeyEnv: providerFlags.apiKeyEnv,
    headers: providerFlags.headers,
  });

  const systemPrompt = buildSkillSystemPrompt({
    skillName: resolvedSkill.skillName,
    skillContent: resolvedSkill.content,
    userInput: userInput || `Run the ${resolvedSkill.skillName} workflow for this workspace.`,
    agentsContent: getWorkspaceAgentsContent(process.cwd()),
    source: resolvedSkill.source,
  });

  try {
    await runModelToolLoop(
      userInput || `Execute ${resolvedSkill.skillName}`,
      process.cwd(),
      {
        provider: providerFlags.provider as any,
        model: providerFlags.model,
        baseUrl: providerFlags.baseUrl,
        apiKey: providerFlags.apiKey,
        apiKeyEnv: providerFlags.apiKeyEnv,
        headers: providerFlags.headers,
        reasoning: providerFlags.reasoning || 'medium',
        yolo: providerFlags.yolo,
      },
      {
        maxIterations: 6,
        showEvidence: true,
        systemPrompt,
      }
    );
  } finally {
    await providerManager.disconnect();
  }
}

// Main CLI handler
export async function main(args: string[]): Promise<void> {
  // Handle flags that look like commands (e.g., --browser, --api)
  let command = args[0];
  let restArgs = args.slice(1);
  
  if (command === '--version' || command === '-v' || command === '--help' || command === '-h') {
    restArgs = [];
  } else {
    // If first arg is a flag starting with --, treat as launch command
    if (command && command.startsWith('--')) {
      command = undefined as any;
      restArgs = args;
    }
  }
  
  const flags = {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };

  try {
    switch (command) {
      case 'setup':
        await setup(flags);
        break;
      case 'doctor':
        await doctor();
        break;
      case 'uninstall':
        await uninstall(flags);
        break;
      case 'version':
      case '--version':
      case '-v':
        version();
        break;
      case 'help':
      case '--help':
      case '-h':
        console.log(HELP);
        break;
      case 'ralph':
        await invokeSkill('ralph', restArgs);
        break;
      case 'team':
        await invokeSkill('team', restArgs);
        break;
      case 'plan':
        await invokeSkill('plan', restArgs);
        break;
      case 'deep-interview':
        await invokeSkill('deep-interview', restArgs);
        break;
      case 'autopilot':
        await invokeSkill('autopilot', restArgs);
        break;
      case 'cancel':
        await invokeSkill('cancel', restArgs);
        break;
      case 'config':
        await configCommand(restArgs);
        break;
      case 'use':
      case 'provider':
        await useCommand(restArgs);
        break;
      case 'model':
        await modelCommand(restArgs);
        break;
      case 'code-review':
        await invokeSkill('code-review', restArgs);
        break;
      case 'security-review':
        await invokeSkill('security-review', restArgs);
        break;
      case 'git':
      case 'git-master':
        await invokeSkill('git-master', restArgs);
        break;
      case 'build-fix':
      case 'fix':
        await invokeSkill('build-fix', restArgs);
        break;
      case 'tdd':
        await invokeSkill('tdd', restArgs);
        break;
      case 'analyze':
        await invokeSkill('analyze', restArgs);
        break;
      case 'visual-verdict':
        await invokeSkill('visual-verdict', restArgs);
        break;
      case undefined:
      case 'launch':
        await launch(restArgs);
        break;
      default:
        if (command?.startsWith('$')) {
          await invokeSkill(command.slice(1), restArgs);
        } else if (command && loadSkillContent(process.cwd(), command)) {
          await invokeSkill(command, restArgs);
        } else {
          await oneShot(args);
        }
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
