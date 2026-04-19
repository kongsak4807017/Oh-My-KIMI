/**
 * Passthrough Mode - Run Kimi CLI directly without OMK REPL wrapper
 * Gives users the native Kimi CLI experience in PowerShell/CMD
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadSkillContent,
  buildSkillSystemPrompt,
  getWorkspaceAgentsContent,
  stripCliFlags,
} from '../skills/runtime.js';
import { getProviderManager } from '../providers/manager.js';
import { runEngine } from '../orchestration/index.js';
import { parseHeaderFlags } from '../config.js';
import { runModelPrompt } from '../orchestration/model-runner.js';

function parseFlags(args: string[]): {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  reasoning?: string;
  yolo?: boolean;
  thinking?: boolean;
} {
  const flags: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
    reasoning?: string;
    yolo?: boolean;
    thinking?: boolean;
  } = {};
  const headerValues: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--high') {
      flags.reasoning = 'high';
      flags.thinking = true;
    } else if (arg === '--thinking') {
      flags.thinking = true;
    } else if (arg === '--yolo') {
      flags.yolo = true;
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
    } else if (arg === '--cli') {
      flags.provider = 'cli';
    } else if (arg === '--model' && args[i + 1]) {
      flags.model = args[i + 1];
      i++;
    } else if (arg === '--base-url' && args[i + 1]) {
      flags.baseUrl = args[i + 1];
      i++;
    } else if (arg === '--api-key-env' && args[i + 1]) {
      flags.apiKeyEnv = args[i + 1];
      i++;
    } else if (arg === '--header' && args[i + 1]) {
      headerValues.push(args[i + 1]);
      i++;
    }
  }
  if (headerValues.length > 0) flags.headers = parseHeaderFlags(headerValues);
  return flags;
}

function detectSkillFromArgs(args: string[]): string | null {
  const stripped = stripCliFlags(args);
  if (stripped.length === 0) return null;
  const first = stripped[0];
  if (first.startsWith('$')) return first.slice(1);
  // Also support plain skill names without $
  if (loadSkillContent(process.cwd(), first)) return first;
  return null;
}

function getPromptText(args: string[]): string {
  const stripped = stripCliFlags(args);
  const skillName = detectSkillFromArgs(args);
  if (skillName && stripped[0].startsWith('$')) {
    return stripped.slice(1).join(' ').trim();
  }
  if (skillName) {
    return stripped.slice(1).join(' ').trim();
  }
  return stripped.join(' ').trim();
}

/**
 * Build the combined prompt with AGENTS.md and skill context
 */
function buildCombinedPrompt(cwd: string, args: string[]): string {
  const skillName = detectSkillFromArgs(args);
  const userInput = getPromptText(args);

  let systemPrompt = 'You are a helpful AI assistant for software development.';

  const agentsContent = getWorkspaceAgentsContent(cwd);
  if (agentsContent) {
    systemPrompt += '\n\n## Project Guidelines (AGENTS.md)\n' + agentsContent;
  }

  if (skillName) {
    const resolvedSkill = loadSkillContent(cwd, skillName);
    if (resolvedSkill) {
      const skillPrompt = buildSkillSystemPrompt({
        skillName: resolvedSkill.skillName,
        skillContent: resolvedSkill.content,
        userInput: userInput || `Execute ${resolvedSkill.skillName}`,
        agentsContent,
        source: resolvedSkill.source,
      });
      systemPrompt += '\n\n---\n\n' + skillPrompt;
    }
  }

  const fullPrompt = userInput
    ? `${systemPrompt}\n\nUser request: ${userInput}`
    : systemPrompt;

  return fullPrompt;
}

const ENGINE_SKILLS = new Set([
  'ralph',
  'team',
  'ultrawork',
  'swarm',
  'ultraqa',
  'pipeline',
  'autopilot',
  'plan',
  'ralplan',
  'deep-interview',
]);

/**
 * Launch Kimi CLI in passthrough mode
 * If a managed engine skill is detected, route to the orchestration layer.
 */
export async function launchPassthrough(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const flags = parseFlags(args);
  const skillName = detectSkillFromArgs(args);

  // Route to engine if skill is supported by the orchestration layer
  if (skillName && ENGINE_SKILLS.has(skillName)) {
    const stripped = stripCliFlags(args);
    const skillArgs = skillName && stripped[0].startsWith('$')
      ? stripped.slice(1)
      : (skillName ? stripped.slice(1) : stripped);

    await runEngine(skillName, skillArgs, cwd, flags as any);
    return;
  }

  const combinedPrompt = buildCombinedPrompt(cwd, args);

  if (!combinedPrompt.trim()) {
    console.error('Error: No prompt provided. Usage: omk --passthrough "your task here"');
    process.exit(1);
  }

  if (flags.provider && flags.provider !== 'cli') {
    await runModelPrompt(combinedPrompt, flags as any);
    return;
  }

  // Verify Kimi CLI is available for native passthrough.
  const providerManager = getProviderManager();
  await providerManager.initialize({ type: 'cli', reasoning: (flags.reasoning as any) || 'medium' });

  const isWindows = process.platform === 'win32';
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    CHCP: '65001',
  };

  // Determine Kimi CLI arguments
  const kimiArgs: string[] = [];

  if (flags.yolo) {
    kimiArgs.push('--yolo');
  }
  if (flags.thinking || flags.reasoning === 'high') {
    kimiArgs.push('--thinking');
  }

  // Strategy:
  // On Windows with long prompts, write to a temp file and use stdin-like approach.
  // Otherwise use -p flag directly.
  const promptLength = Buffer.byteLength(combinedPrompt, 'utf-8');
  const useTempFile = isWindows && promptLength > 8000;

  if (useTempFile) {
    // Write prompt to temp file and use --input-format text with stdin from file
    const tmpDir = mkdtempSync(join(tmpdir(), 'omk-passthrough-'));
    const tmpFile = join(tmpDir, 'prompt.txt');
    writeFileSync(tmpFile, combinedPrompt, 'utf-8');

    kimiArgs.push('--input-format', 'text');

    try {
      const child = spawn('kimi', kimiArgs, {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true,
        env,
      });

      // Stream the file content to stdin then end
      const fs = await import('fs');
      const fd = fs.openSync(tmpFile, 'r');
      const buffer = Buffer.alloc(65536);
      let bytesRead: number;
      while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
        child.stdin?.write(buffer.slice(0, bytesRead));
      }
      fs.closeSync(fd);
      child.stdin?.end();

      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Kimi CLI exited with code ${code}`));
          } else {
            resolve();
          }
        });
        child.on('error', reject);
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } else {
    // Use -p flag for simplicity and reliability
    kimiArgs.push('-p', combinedPrompt);

    const child = spawn('kimi', kimiArgs, {
      stdio: 'inherit',
      shell: true,
      env,
    });

    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Kimi CLI exited with code ${code}`));
        } else {
          resolve();
        }
      });
      child.on('error', reject);
    });
  }
}

/**
 * Launch Kimi CLI in interactive shell mode (no prompt injection, pure native experience)
 * Sets up environment so Kimi CLI can optionally read context files if it supports them.
 */
export async function launchInteractiveShell(): Promise<void> {
  const cwd = process.cwd();
  const isWindows = process.platform === 'win32';

  // Print context hint
  const agentsPath = join(cwd, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    console.log(`\n[OMK Passthrough] AGENTS.md loaded from: ${agentsPath}`);
    console.log('[OMK Passthrough] Launching native Kimi CLI...\n');
  } else {
    console.log('\n[OMK Passthrough] Launching native Kimi CLI...\n');
  }

  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    CHCP: '65001',
    OMK_CWD: cwd,
    OMK_AGENTS_MD: existsSync(agentsPath) ? agentsPath : '',
  };

  const child = spawn('kimi', [], {
    stdio: 'inherit',
    shell: true,
    env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Kimi CLI exited with code ${code}`));
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}
