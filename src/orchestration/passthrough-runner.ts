/**
 * Compatibility runner.
 * runKimiPrompt is kept for older engine imports, but it now routes through
 * the configured provider instead of hardcoding the Kimi CLI.
 */

import { spawn } from 'child_process';
import { runModelPrompt, RunResult } from './model-runner.js';

export async function runKimiPrompt(
  prompt: string,
  options: {
    provider?: any;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
    yolo?: boolean;
    thinking?: boolean;
    reasoning?: string;
  } = {}
): Promise<RunResult> {
  return runModelPrompt(prompt, options);
}

/**
 * Run Kimi CLI in interactive shell mode with stdio inheritance.
 * No capture - purely native experience.
 */
export async function runKimiShell(options: { yolo?: boolean } = {}): Promise<number | null> {
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    CHCP: '65001',
  };

  const args: string[] = [];
  if (options.yolo) {
    args.push('--yolo');
  }

  const child = spawn('kimi', args, {
    stdio: 'inherit',
    shell: true,
    env,
  });

  return new Promise<number | null>((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
}
