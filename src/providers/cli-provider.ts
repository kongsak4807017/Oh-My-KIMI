/**
 * OAuth-backed CLI providers.
 *
 * These providers do not copy or read tokens. They run the native CLI so OMK can
 * reuse the login/session state already managed by Kimi CLI, Gemini CLI, or
 * Codex CLI.
 */

import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  Provider,
  ProviderConfig,
  ProviderType,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from './types.js';

export type CLIProviderProfile = 'kimi' | 'gemini' | 'codex';

interface CLIInvocation {
  command: string;
  args: string[];
  stdin?: string;
  outputFile?: string;
  cleanupDir?: string;
}

const PROFILE_DEFAULTS: Record<CLIProviderProfile, {
  type: Extract<ProviderType, 'cli' | 'kimi-cli' | 'gemini-cli' | 'codex-cli'>;
  name: string;
  command: string;
  authHint: string;
}> = {
  kimi: {
    type: 'kimi-cli',
    name: 'Kimi CLI OAuth',
    command: 'kimi',
    authHint: 'Run: kimi login',
  },
  gemini: {
    type: 'gemini-cli',
    name: 'Gemini CLI OAuth',
    command: 'gemini',
    authHint: 'Run: gemini auth login or launch gemini once and sign in',
  },
  codex: {
    type: 'codex-cli',
    name: 'Codex CLI OAuth',
    command: 'codex',
    authHint: 'Run: codex login',
  },
};

function formatMessages(options: ChatOptions): string {
  if (options.messages.length === 1) {
    return options.messages[0]?.content ?? '';
  }

  return options.messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n');
}

function createCodexOutputFile(): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'omk-codex-'));
  return {
    dir,
    file: join(dir, 'last-message.txt'),
  };
}

export function buildCLIInvocation(
  profile: CLIProviderProfile,
  config: ProviderConfig,
  options: ChatOptions,
): CLIInvocation {
  const defaults = PROFILE_DEFAULTS[profile];
  const command = config.cliPath ?? defaults.command;
  const prompt = formatMessages(options);
  const model = options.model ?? config.model;
  const extraArgs = config.cliArgs ?? [];

  if (profile === 'kimi') {
    const args = ['--print', '--final-message-only', '--input-format', 'text'];
    if ((options.reasoning ?? config.reasoning) === 'high') {
      args.push('--thinking');
    }
    if (model) {
      args.push('--model', model);
    }
    args.push(...extraArgs);
    return { command, args, stdin: prompt };
  }

  if (profile === 'gemini') {
    const args = ['--prompt', prompt, '--output-format', 'text'];
    if (model) {
      args.push('--model', model);
    }
    args.push(...extraArgs);
    return { command, args };
  }

  const { file, dir } = createCodexOutputFile();
  const args = [
    'exec',
    '--color',
    'never',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--output-last-message',
    file,
  ];
  if (model) {
    args.push('--model', model);
  }
  args.push(...extraArgs, '-');
  return { command, args, stdin: prompt, outputFile: file, cleanupDir: dir };
}

export class CLIProvider implements Provider {
  readonly name: string;
  readonly type: ProviderType;

  private config: ProviderConfig;
  private profile: CLIProviderProfile;

  constructor(profile: CLIProviderProfile = 'kimi', type?: Extract<ProviderType, 'cli' | 'kimi-cli' | 'gemini-cli' | 'codex-cli'>) {
    const defaults = PROFILE_DEFAULTS[profile];
    this.profile = profile;
    this.type = type ?? defaults.type;
    this.name = type === 'cli' ? 'Kimi CLI' : defaults.name;
    this.config = {
      type: this.type,
      cliPath: defaults.command,
      timeout: 600000,
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config, type: this.type };

    const available = await this.isAvailable();
    if (!available) {
      const defaults = PROFILE_DEFAULTS[this.profile];
      throw new Error(
        `${this.name} not found or not runnable.\n` +
        `Install and authenticate the native CLI first.\n` +
        `${defaults.authHint}\n` +
        'Or choose another provider with --provider openrouter, --provider custom, or --browser.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const command = this.config.cliPath ?? PROFILE_DEFAULTS[this.profile].command;
      const check = spawn(command, ['--version'], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });

      let settled = false;
      const finish = (available: boolean) => {
        if (settled) return;
        settled = true;
        resolve(available);
      };

      check.on('exit', (code) => finish(code === 0));
      check.on('error', () => finish(false));

      setTimeout(() => {
        check.kill();
        finish(false);
      }, 5000).unref?.();
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const invocation = buildCLIInvocation(this.profile, this.config, options);
    try {
      const { stdout, stderr, code } = await this.run(invocation);
      let content = invocation.outputFile && existsSync(invocation.outputFile)
        ? readFileSync(invocation.outputFile, 'utf-8').trim()
        : stdout.trim();

      if (!content && stdout.trim()) {
        content = stdout.trim();
      }

      // Include stderr in content if stdout is empty (shows CLI errors like "LLM not set")
      if (!content && stderr.trim()) {
        content = `[${this.name} Error] ${stderr.trim()}`;
      }

      if (code !== 0 && !content) {
        throw new Error(`${this.name} exited with code ${code}: ${stderr || stdout}`);
      }

      return {
        content,
        usage: undefined,
      };
    } finally {
      if (invocation.cleanupDir) {
        rmSync(invocation.cleanupDir, { recursive: true, force: true });
      }
    }
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await this.chat(options);
    if (response.content) {
      yield { content: response.content, done: false };
    }
    yield { content: '', done: true };
  }

  async disconnect(): Promise<void> {
    // Native CLIs own their sessions.
  }

  private run(invocation: CLIInvocation): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      const env = process.platform === 'win32'
        ? { ...process.env, PYTHONIOENCODING: 'utf-8', CHCP: '65001' }
        : process.env;

      const child = spawn(invocation.command, invocation.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn();
      };

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('exit', (code) => {
        settle(() => resolve({ stdout, stderr, code }));
      });

      child.on('error', (err) => {
        settle(() => reject(new Error(`Failed to run ${this.name}: ${err.message}`)));
      });

      if (invocation.stdin !== undefined) {
        child.stdin?.write(invocation.stdin);
      }
      child.stdin?.end();

      timer = setTimeout(() => {
        child.kill();
        settle(() => {
          if (stdout.trim()) {
            resolve({ stdout, stderr, code: null });
          } else {
            reject(new Error(`${this.name} command timed out`));
          }
        });
      }, this.config.timeout ?? 600000);
      timer.unref?.();
    });
  }
}
