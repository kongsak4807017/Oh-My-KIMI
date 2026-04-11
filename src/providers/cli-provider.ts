/**
 * CLI Provider - Use official Kimi CLI if available
 * Falls back to other providers if CLI not found
 */

import { spawn } from 'child_process';
import { 
  Provider, 
  ProviderConfig, 
  ChatOptions, 
  ChatResponse, 
  StreamChunk 
} from './types.js';

export class CLIProvider implements Provider {
  readonly name = 'Kimi CLI';
  readonly type = 'cli' as const;
  
  private config: ProviderConfig = {
    type: 'cli',
    cliPath: 'kimi',
    timeout: 60000,
  };

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // Check if CLI is available
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Kimi CLI not found.\n' +
        'Install with: (if available)\n' +
        '  npm install -g @moonshot-ai/kimi-cli\n' +
        'Or use --provider=api or --provider=browser instead.'
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn(this.config.cliPath ?? 'kimi', ['--version'], {
        stdio: 'ignore',
        shell: true,
      });
      
      check.on('exit', (code) => {
        resolve(code === 0);
      });
      
      check.on('error', () => {
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        check.kill();
        resolve(false);
      }, 5000);
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const lastMessage = options.messages[options.messages.length - 1];
    const content = lastMessage?.content ?? '';

    return new Promise((resolve, reject) => {
      const args = ['chat', '--no-stream'];
      
      if (this.config.reasoning) {
        args.push('--reasoning', this.config.reasoning);
      }
      
      const child = spawn(this.config.cliPath ?? 'kimi', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
      
      let output = '';
      let error = '';
      
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          resolve({
            content: output.trim(),
            usage: undefined,
          });
        } else {
          reject(new Error(`CLI exited with code ${code}: ${error || output}`));
        }
      });
      
      child.on('error', (err) => {
        reject(new Error(`Failed to run CLI: ${err.message}`));
      });
      
      // Send input
      child.stdin?.write(content);
      child.stdin?.end();
      
      // Timeout
      setTimeout(() => {
        child.kill();
        reject(new Error('CLI command timed out'));
      }, this.config.timeout ?? 60000);
    });
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const lastMessage = options.messages[options.messages.length - 1];
    const content = lastMessage?.content ?? '';

    const args = ['chat'];
    
    if (this.config.reasoning) {
      args.push('--reasoning', this.config.reasoning);
    }

    const child = spawn(this.config.cliPath ?? 'kimi', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdin?.write(content);
    child.stdin?.end();

    let buffer = '';
    
    child.stdout?.on('data', (data) => {
      buffer += data.toString();
    });

    // Yield chunks as they arrive
    while (child.exitCode === null) {
      if (buffer.length > 0) {
        const chunk = buffer;
        buffer = '';
        yield { content: chunk, done: false };
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Final buffer
    if (buffer.length > 0) {
      yield { content: buffer, done: false };
    }

    yield { content: '', done: true };
  }

  async disconnect(): Promise<void> {
    // Nothing to clean up for CLI mode
  }
}
