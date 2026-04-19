/**
 * Execute Command Tool
 * Run shell commands safely
 */

import { spawn } from 'child_process';

export interface ExecuteCommandInput {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export class ExecuteTool {
  private allowedCommands: Set<string>;
  private blockedPatterns: RegExp[];

  constructor() {
    // Allow list of safe commands
    this.allowedCommands = new Set([
      'git', 'npm', 'node', 'npx', 'tsc', 'eslint', 'prettier',
      'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'cd',
      'mkdir', 'touch', 'rm', 'del', 'cp', 'copy', 'mv', 'move',
      'grep', 'find', 'findstr', 'rg', 'head', 'tail',
      'python', 'python3', 'pip', 'pip3',
      'cargo', 'rustc', 'go', 'java', 'javac',
    ]);

    // Block dangerous patterns
    this.blockedPatterns = [
      /rm\s+-rf\s+\//,           // rm -rf /
      />\s*\/dev\/null/,         // Output redirection to null
      /:\(\)\{\s*:\|\:&\s*};:/,  // Fork bomb
      /curl.*\|.*sh/,            // curl pipe sh
      /wget.*\|.*sh/,            // wget pipe sh
      /eval\s*\(/,               // eval
      /exec\s*\(/,               // exec
    ];
  }

  async execute(input: ExecuteCommandInput): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
  }> {
    const parsed = this.normalizeCommand(input.command, input.args);
    // Security check
    const cmdBase = parsed.command;
    
    if (!this.allowedCommands.has(cmdBase)) {
      throw new Error(`Command not allowed: ${cmdBase}. Allowed: ${Array.from(this.allowedCommands).slice(0, 10).join(', ')}...`);
    }

    // Check blocked patterns
    const fullCmd = `${parsed.command} ${parsed.args.join(' ')}`;
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(fullCmd)) {
        throw new Error(`Dangerous command pattern detected: ${pattern}`);
      }
    }

    const startTime = Date.now();
    const timeout = input.timeout || 60000;

    return new Promise((resolve, reject) => {
      const child = spawn(parsed.command, parsed.args, {
        cwd: input.cwd || process.cwd(),
        env: { ...process.env, ...input.env },
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 100000) {
          stdout = stdout.slice(0, 100000) + '\n... [Output truncated]';
          child.kill();
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 100000) {
          stderr = stderr.slice(0, 100000) + '\n... [Error output truncated]';
        }
      });

      child.on('exit', (code) => {
        const duration = Date.now() - startTime;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          duration,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to execute: ${err.message}`));
      });

      // Timeout
      setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private normalizeCommand(command: string, args?: string[]): { command: string; args: string[] } {
    if (args?.length) {
      return { command, args };
    }

    const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    if (tokens.length === 0) {
      throw new Error('Command is required');
    }

    const parsedCommand = tokens[0];
    if (!parsedCommand) {
      throw new Error('Command is required');
    }

    return {
      command: parsedCommand,
      args: tokens.slice(1).map((token) => token.replace(/^['"]|['"]$/g, '')),
    };
  }

  /**
   * Quick git commands
   */
  async git(args: string[], cwd?: string): Promise<string> {
    const result = await this.execute({
      command: 'git',
      args,
      cwd,
      timeout: 30000,
    });
    
    if (result.exitCode !== 0) {
      throw new Error(`Git error: ${result.stderr}`);
    }
    
    return result.stdout;
  }

  /**
   * Run npm/yarn command
   */
  async npm(args: string[], cwd?: string): Promise<string> {
    const result = await this.execute({
      command: 'npm',
      args,
      cwd,
      timeout: 120000,
    });
    
    return result.stdout + (result.stderr ? `\n${result.stderr}` : '');
  }
}

let tool: ExecuteTool | null = null;

export function getExecuteTool(): ExecuteTool {
  if (!tool) {
    tool = new ExecuteTool();
  }
  return tool;
}
