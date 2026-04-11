/**
 * oh-my-kimi CLI
 * Multi-agent orchestration for Kimi AI
 */

import React from 'react';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

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

const VERSION = "0.1.0";
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
    await copySkills(builtinSkillsSrc, builtinSkillsDst, options.force, options.verbose);
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

  console.log('\\n✅ OMK setup complete!');
  console.log('\\nNext steps:');
  console.log('  1. Set your KIMI_API_KEY environment variable');
  console.log('  2. Run: omk --high');
  console.log('  3. Try: $ralph "your task here"');
}

function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), '..', '..');
}

async function copySkills(src: string, dst: string, force: boolean, verbose: boolean = false): Promise<void> {
  const { readdirSync, copyFileSync, mkdirSync, existsSync } = await import('fs');
  const { join } = await import('path');
  
  if (!existsSync(src)) return;
  
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    
    if (entry.isDirectory()) {
      // Check if it's a skill directory (has SKILL.md)
      const skillFile = join(srcPath, 'SKILL.md');
      if (existsSync(skillFile)) {
        if (!existsSync(dstPath)) {
          mkdirSync(dstPath, { recursive: true });
        }
        if (!existsSync(join(dstPath, 'SKILL.md')) || force) {
          copyFileSync(skillFile, join(dstPath, 'SKILL.md'));
          if (verbose) {
            console.log(`Copied skill: ${entry.name}`);
          }
        }
      }
    }
  }
}

function generateAgentsTemplate(): string {
  return `<!-- AUTONOMY DIRECTIVE - DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION.
DO NOT STOP TO ASK "SHOULD I PROCEED?" — PROCEED. DO NOT WAIT FOR CONFIRMATION ON OBVIOUS NEXT STEPS.
IF BLOCKED, TRY AN ALTERNATIVE APPROACH. ONLY ASK WHEN TRULY AMBIGUOUS OR DESTRUCTIVE.
<!-- END AUTONOMY DIRECTIVE -->

# Oh-my-KIMI - Intelligent Multi-Agent Orchestration

You are running with Oh-my-KIMI (OMK), a coordination layer for Kimi AI CLI.
This AGENTS.md is the top-level operating contract for the workspace.

<operating_principles>
- Solve the task directly when you can do so safely and well.
- Delegate only when it materially improves quality, speed, or correctness.
- Keep progress short, concrete, and useful.
- Prefer evidence over assumption; verify before claiming completion.
- Use the lightest path that preserves quality: direct action, then delegation.
- Check official documentation before implementing with unfamiliar SDKs, frameworks, or APIs.
</operating_principles>

## Working agreements
- Write a cleanup plan before modifying code for cleanup/refactor/deslop work.
- Prefer deletion over addition.
- Reuse existing utils and patterns before introducing new abstractions.
- No new dependencies without explicit request.
- Keep diffs small, reviewable, and reversible.
- Run lint, typecheck, tests, and static analysis after changes.

---

<delegation_rules>
Default posture: work directly.

Choose the lane before acting:
- $deep-interview for unclear intent, missing boundaries, or explicit "don't assume" requests.
- $plan when requirements are clear enough but plan, tradeoff, or test-shape review is still needed.
- $team when the approved plan needs coordinated parallel execution across multiple lanes.
- $ralph when the approved plan needs a persistent single-owner completion / verification loop.
- **Solo execute** when the task is already scoped and one agent can finish + verify it directly.

Delegate only when it materially improves quality, speed, or safety. Do not delegate trivial work.
</delegation_rules>

<invocation_conventions>
- \\$name — invoke a workflow skill or role keyword
- /skills — browse available skills
</invocation_conventions>

<model_routing>
Match effort to task shape:
- Low complexity: fast responses
- Standard: normal reasoning
- High complexity: deep reasoning
</model_routing>

---

<agent_catalog>
Key roles:
- \`explore\` — fast codebase search and mapping
- \`planner\` — work plans and sequencing
- \`architect\` — read-only analysis, diagnosis, tradeoffs
- \`debugger\` — root-cause analysis
- \`executor\` — implementation and refactoring
- \`verifier\` — completion evidence and validation
</agent_catalog>

---

<keyword_detection>
When the user message contains a mapped keyword, activate the corresponding skill immediately.
Do not ask for confirmation.

| Keyword(s) | Skill | Action |
|-------------|-------|--------|
| "ralph", "don't stop", "must complete" | $ralph | Start persistence loop |
| "team", "swarm", "parallel" | $team | Start team orchestration |
| "plan this", "plan the", "let's plan" | $plan | Start planning workflow |
| "interview", "deep interview", "don't assume" | $deep-interview | Run Socratic interview |
| "autopilot", "build me", "I want a" | $autopilot | Run autonomous pipeline |
| "cancel", "stop", "abort" | $cancel | Cancel active modes |
</keyword_detection>

---

<skills>
Skills are workflow commands.
Core workflows include \`autopilot\`, \`ralph\`, \`plan\`, \`deep-interview\`, and \`team\`.
Utilities include \`cancel\`, \`help\`, and \`doctor\`.
</skills>

---

<verification>
Verify before claiming completion.

Sizing guidance:
- Small changes: lightweight verification
- Standard changes: standard verification
- Large or security/architectural changes: thorough verification
</verification>

<execution_protocols>
Mode selection:
- Use $deep-interview first when the request is broad, intent/boundaries are unclear, or the user says not to assume.
- Use $plan when the requirements are clear enough but architecture, tradeoffs, or test strategy still need consensus.
- Use $team when the approved plan has multiple independent lanes, shared blockers, or durable coordination needs.
- Use $ralph when the approved plan should stay in a persistent completion / verification loop with one owner.
- Otherwise execute directly in solo mode.

Stop / escalate:
- Stop when the task is verified complete, the user says stop/cancel, or no meaningful recovery path remains.
- Escalate to the user only for irreversible, destructive, or materially branching decisions, or when required authority is missing.

Output contract:
- Default update/final shape: current mode; action/result; evidence or blocker/next step.
- Keep rationale once; do not restate the full plan every turn.

Parallelization:
- Run independent tasks in parallel.
- Run dependent tasks sequentially.
</execution_protocols>

<cancellation>
Use the \`cancel\` skill to end execution modes.
Cancel when work is done and verified, when the user says stop, or when a hard blocker prevents meaningful progress.
Do not cancel while recoverable work remains.
</cancellation>

---

<state_management>
OMK persists runtime state under \`.omk/\`:
- \`.omk/state/\` — mode state
- \`.omk/notepad.md\` — session notes
- \`.omk/plans/\` — plans
- \`.omk/logs/\` — logs
</state_management>

---

## Setup

Run \`omk setup\` to install all components. Run \`omk doctor\` to verify installation.
`;
}

// Doctor command
async function doctor(): Promise<void> {
  console.log('🔍 Running OMK health check...\\n');
  
  const checks: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion >= 20) {
    checks.push({ name: 'Node.js', status: 'ok', message: `v${nodeVersion}` });
  } else {
    checks.push({ name: 'Node.js', status: 'error', message: `v${nodeVersion} (requires >=20)` });
  }

  // Check API key
  if (process.env.KIMI_API_KEY) {
    checks.push({ name: 'KIMI_API_KEY', status: 'ok', message: 'Set' });
  } else {
    checks.push({ name: 'KIMI_API_KEY', status: 'error', message: 'Not set - required for API calls' });
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

  console.log('\\n📋 Summary:');
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

  // Check for TUI mode
  const useTUI = args.includes('--tui');
  
  if (useTUI) {
    // Start TUI mode
    await launchTUI(flags);
  } else {
    // Start classic REPL mode
    const { startREPL } = await import('../repl/index.js');
    await startREPL(process.cwd(), {
      provider: flags.provider,
      reasoning: flags.reasoning,
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
  const omkPath = getOmkPath();
  const skillPath = join(omkPath, 'skills', skillName, 'SKILL.md');
  
  if (!existsSync(skillPath)) {
    console.error(`❌ Skill not found: ${skillName}`);
    console.log(`Run "omk setup" to install skills.`);
    process.exit(1);
  }

  const skillContent = readFileSync(skillPath, 'utf-8');
  
  // Parse skill and execute
  console.log(`🔧 Activating skill: ${skillName}`);
  
  // TODO: Implement skill execution engine
  console.log('\\nSkill content preview:');
  console.log(skillContent.slice(0, 500) + '...');
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
