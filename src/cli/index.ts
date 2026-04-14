/**
 * oh-my-kimi CLI
 * Multi-agent orchestration for Kimi AI
 */

import React from 'react';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import {
  buildSkillSystemPrompt,
  copySkillTree,
  getWorkspaceAgentsContent,
  listAvailableSkills,
  loadSkillContent,
  stripCliFlags,
} from '../skills/runtime.js';

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
  | "help"
  | "version"
  | string;

// Constants
const HELP = `
oh-my-kimi (omk) - Multi-agent orchestration for Kimi AI

Usage:
  omk                    Launch Kimi interactive session
  omk --tui              Launch TUI mode (full UI with agents panel)
  omk setup              Install skills, prompts, and AGENTS.md scaffolding
  omk doctor             Check installation health
  omk uninstall          Remove OMK configuration
  omk ralph "<task>"     Start persistent completion loop
  omk team "<task>"      Start coordinated team execution
  omk plan "<task>"      Create implementation plan
  omk deep-interview     Socratic requirements clarification
  omk autopilot "<task>" Full autonomous pipeline
  omk cancel             Cancel active execution modes
  omk help               Show this help message
  omk version            Show version information

Options:
  --provider <type>      Kimi provider: api, browser, cli, auto (default: auto)
  --api                  Shortcut for --provider=api
  --browser              Shortcut for --provider=browser (uses subscription)
  --cli                  Shortcut for --provider=cli
  --high                 Use high reasoning effort
  --yolo                 Bypass confirmations (dangerous)
  --tui                  Use TUI mode (full terminal UI)
  --force                Force reinstall
  --dry-run              Show what would be done
  --verbose              Show detailed output

Environment Variables:
  KIMI_API_KEY           Your Moonshot AI API key (for --provider=api)
  KIMI_BASE_URL          API base URL (default: https://api.moonshot.cn/v1)
  OMK_MODEL              Default model (default: kimi-k2-0711-preview)

Provider Modes:
  api                    Use Kimi API (requires KIMI_API_KEY)
  browser                Use Kimi web interface (uses your subscription, free!)
  cli                    Use official Kimi CLI (if installed)
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
  console.log('  1. Set your KIMI_API_KEY environment variable');
  console.log('  2. Run: omk --high');
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
    : '# Oh-my-KIMI - OMK Project\n';

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

  // Check API key
  if (process.env.KIMI_API_KEY) {
    checks.push({ name: 'KIMI_API_KEY', status: 'ok', message: 'Set' });
  } else {
    checks.push({ name: 'KIMI_API_KEY', status: 'warn', message: 'Not set - API mode unavailable, browser/cli may still work' });
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
    const icon = check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
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

  console.log('\\n✅ OMK uninstalled.');
}

// Version command
function version(): void {
  console.log(`oh-my-kimi v${VERSION}`);
}

// Launch command (main entry)
async function launch(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  
  // Check prerequisites based on provider
  if (flags.provider === 'api' && !process.env.KIMI_API_KEY) {
    console.error('❌ Error: KIMI_API_KEY required for API mode');
    console.error('   Set it with: export KIMI_API_KEY=your_key');
    console.error('   Or use: omk --browser (subscription mode, free!)');
    process.exit(1);
  }
  
  console.log('>> Launching Oh-my-KIMI...');
  
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
    if (!process.env.KIMI_API_KEY) {
      console.log('\n[INFO] No API key found. Will try browser mode (subscription)');
      console.log('       Tip: Use --browser flag to connect via your Kimi subscription');
    }
  }

  // Check for TUI mode (only on supported terminals)
  const useTUI = args.includes('--tui') && process.platform !== 'win32';
  
  if (useTUI) {
    // Start TUI mode (Unix/Mac only)
    await launchTUI(flags);
  } else {
    // Start classic REPL mode (works everywhere including Windows CMD)
    const { startREPL } = await import('../repl/index.js');
    await startREPL(process.cwd(), {
      provider: flags.provider,
      reasoning: flags.reasoning,
      yolo: flags.yolo,
    });
  }
}

// TUI Launcher
async function launchTUI(flags: { provider?: string; reasoning?: string; yolo?: boolean }): Promise<void> {
  const { render } = await import('ink');
  const { OMKApp } = await import('../tui/app.js');
  const { getProviderManager } = await import('../providers/manager.js');
  
  const providerManager = getProviderManager();
  
  // Initialize provider
  try {
    await providerManager.initialize({
      type: (flags.provider as 'api' | 'browser' | 'cli' | 'auto') || 'auto',
      reasoning: (flags.reasoning as 'low' | 'medium' | 'high') || 'medium',
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
      yolo: flags.yolo,
    })
  );
}

function parseFlags(args: string[]): { 
  yolo?: boolean; 
  high?: boolean;
  model?: string;
  reasoning?: string;
  provider?: string;
} {
  const flags: { yolo?: boolean; high?: boolean; model?: string; reasoning?: string; provider?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--yolo') {
      flags.yolo = true;
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
    } else if (arg === '--browser') {
      flags.provider = 'browser';
    } else if (arg === '--cli') {
      flags.provider = 'cli';
    } else if (arg === '--model' && args[i + 1]) {
      flags.model = args[i + 1];
      i++;
    }
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

  const { getProviderManager } = await import('../providers/manager.js');
  const providerManager = getProviderManager();

  await providerManager.initialize({
    type: (providerFlags.provider as 'api' | 'browser' | 'cli' | 'auto') || 'auto',
    reasoning: (providerFlags.reasoning as 'low' | 'medium' | 'high') || 'medium',
    model: providerFlags.model,
  });

  const provider = providerManager.getProvider();
  const systemPrompt = buildSkillSystemPrompt({
    skillName: resolvedSkill.skillName,
    skillContent: resolvedSkill.content,
    userInput: userInput || `Run the ${resolvedSkill.skillName} workflow for this workspace.`,
    agentsContent: getWorkspaceAgentsContent(process.cwd()),
    source: resolvedSkill.source,
  });

  try {
    let output = '';
    for await (const chunk of provider.stream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput || `Execute ${resolvedSkill.skillName}` },
      ],
      reasoning: (providerFlags.reasoning as 'low' | 'medium' | 'high') || 'medium',
    })) {
      process.stdout.write(chunk.content);
      output += chunk.content;
      if (chunk.done) break;
    }

    if (!output.endsWith('\n')) {
      process.stdout.write('\n');
    }
  } finally {
    await providerManager.disconnect();
  }
}

// Main CLI handler
export async function main(args: string[]): Promise<void> {
  // Handle flags that look like commands (e.g., --browser, --api)
  let command = args[0];
  let restArgs = args.slice(1);
  
  // If first arg is a flag starting with --, treat as launch command
  if (command && command.startsWith('--')) {
    command = undefined as any;
    restArgs = args;
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
          console.error(`Unknown command: ${command}`);
          console.log(HELP);
          process.exit(1);
        }
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
