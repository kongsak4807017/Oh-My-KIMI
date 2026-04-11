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
      // Kimi CLI v1.24+ syntax: kimi --print --final-message-only -p "prompt"
      const useStdin = process.platform === 'win32' && content.includes(' ');
      
      const args = ['--print', '--final-message-only'];
      
      if (this.config.reasoning === 'high') {
        args.push('--thinking');
      }
      
      // Add yolo mode to prevent interactive prompts
      args.push('--yolo');
      
      if (useStdin) {
        args.push('--input-format', 'text');
      } else {
        args.push('-p', content);
      }
      
      // Fix Windows UTF-8 encoding
      const isWindows = process.platform === 'win32';
      const env = isWindows ? { ...process.env, PYTHONIOENCODING: 'utf-8', CHCP: '65001' } : process.env;
      
      const child = spawn(this.config.cliPath ?? 'kimi', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env,
      });
      
      // Send content via stdin if using stdin mode
      if (useStdin) {
        child.stdin?.write(content);
        child.stdin?.end();
      }
      
      let output = '';
      let error = '';
      
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('exit', (code) => {
        if (code === 0 || (code === null && output.length > 0)) {
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
      
      // Timeout - kimi can be slow for complex tasks
      setTimeout(() => {
        child.kill();
        if (output.length > 0) {
          resolve({ content: output.trim(), usage: undefined });
        } else {
          reject(new Error('CLI command timed out'));
        }
      }, this.config.timeout ?? 120000);
    });
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const lastMessage = options.messages[options.messages.length - 1];
    const content = lastMessage?.content ?? '';

    if (!content) {
      yield { content: 'Error: No content to send', done: true };
      return;
    }

    // Fix Windows UTF-8 encoding by setting console code page
    const isWindows = process.platform === 'win32';
    const env = { ...process.env };
    
    if (isWindows) {
      // Force UTF-8 encoding for Python/Kimi CLI
      env.PYTHONIOENCODING = 'utf-8';
      env.CHCP = '65001';  // UTF-8 code page
    }

    // Kimi CLI v1.24+ syntax: kimi --print --final-message-only -p "prompt"
    // Note: On Windows with spaces, use stdin instead of -p flag
    const useStdin = process.platform === 'win32' && content.includes(' ');
    
    const args = ['--print', '--final-message-only'];
    
    // Add thinking mode if reasoning is high
    if (this.config.reasoning === 'high') {
      args.push('--thinking');
    }
    
    // Add yolo mode to prevent interactive prompts
    args.push('--yolo');
    
    if (useStdin) {
      // Use stdin for complex prompts on Windows
      args.push('--input-format', 'text');
    } else {
      // Use -p flag for simple prompts
      args.push('-p', content);
    }

    const cliPath = this.config.cliPath ?? 'kimi';
    
    // Spawn with UTF-8 environment on Windows
    const spawnOptions: any = {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    };
    
    if (isWindows) {
      spawnOptions.env = env;
    }
    
    const child = spawn(cliPath, args, spawnOptions);
    
    // Send content via stdin if using stdin mode
    if (useStdin) {
      child.stdin?.write(content);
      child.stdin?.end();
    }

    let buffer = '';
    let hasError = false;
    
    child.stdout?.on('data', (data) => {
      buffer += data.toString();
    });

    child.stderr?.on('data', (data) => {
      const err = data.toString();
      // Filter out non-error messages and box-drawing characters
      const isRealError = err.includes('Error') && 
                         !err.includes('Try') && 
                         !err.includes('────') &&
                         !err.includes('┌') &&
                         !err.includes('┐') &&
                         !err.includes('└') &&
                         !err.includes('┘') &&
                         !err.includes('│');
      if (isRealError) {
        hasError = true;
        // Clean up error message
        const cleanErr = err
          .replace(/[─│┌┐└┘├┤┬┴┼]/g, '')
          .replace(/Error\s*[-─]+\+/gi, 'Error: ')
          .trim();
        if (cleanErr.length > 10) {
          buffer += `\n[Error: ${cleanErr}]`;
        }
      }
    });

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        resolve();
      });
      child.on('error', (err) => {
        reject(err);
      });
      // Timeout after 120 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('Request timed out'));
      }, 120000);
    });

    // Yield all output
    if (buffer.length > 0) {
      yield { content: buffer, done: false };
    }

    yield { content: '', done: true };
  }

  async disconnect(): Promise<void> {
    // Nothing to clean up for CLI mode
  }
}
