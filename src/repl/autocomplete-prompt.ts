/**
 * Interactive Autocomplete Prompt
 * Custom implementation for IDE-style autocomplete
 */

import { stdin, stdout } from 'process';
import { readdirSync, Dirent } from 'fs';
import { join, extname } from 'path';

export interface Suggestion {
  value: string;
  display: string;
  hint?: string;
  type: 'command' | 'tool' | 'file' | 'skill';
}

export class InteractiveAutocomplete {
  private cwd: string;
  private input: string = '';
  private cursor: number = 0;
  private suggestions: Suggestion[] = [];
  private selectedIndex: number = 0;
  private isActive: boolean = false;
  private resolvePromise: ((value: string) => void) | null = null;
  private mode: 'normal' | 'command' | 'tool' | 'file' = 'normal';

  // Data
  private readonly commands: Suggestion[] = [
    { value: '/help', display: '/help', hint: 'Show all commands', type: 'command' },
    { value: '/skills', display: '/skills', hint: 'List skills', type: 'command' },
    { value: '/tools', display: '/tools', hint: 'List tools', type: 'command' },
    { value: '/clear', display: '/clear', hint: 'Clear screen', type: 'command' },
    { value: '/history', display: '/history', hint: 'Chat history', type: 'command' },
    { value: '/save', display: '/save [name]', hint: 'Save session', type: 'command' },
    { value: '/load', display: '/load [name]', hint: 'Load session', type: 'command' },
    { value: '/note', display: '/note <text>', hint: 'Add note', type: 'command' },
    { value: '/task', display: '/task <title>', hint: 'Create task', type: 'command' },
    { value: '/file', display: '/file <path>', hint: 'Add to context', type: 'command' },
    { value: '/files', display: '/files', hint: 'Context files', type: 'command' },
    { value: '/context', display: '/context', hint: 'Full context', type: 'command' },
    { value: '/tokens', display: '/tokens', hint: 'Token stats', type: 'command' },
    { value: '/cache', display: '/cache', hint: 'Cache stats', type: 'command' },
    { value: '/index', display: '/index', hint: 'Build index', type: 'command' },
    { value: '/map', display: '/map', hint: 'Repository map', type: 'command' },
    { value: '/search', display: '/search <symbol>', hint: 'Search symbols', type: 'command' },
    { value: '/plugins', display: '/plugins', hint: 'List plugins', type: 'command' },
    { value: '/mcp', display: '/mcp [start|stop]', hint: 'MCP server', type: 'command' },
    { value: '/model', display: '/model [provider]', hint: 'Switch provider', type: 'command' },
    { value: '/settings', display: '/settings', hint: 'Show settings', type: 'command' },
    { value: '/status', display: '/status', hint: 'Show status', type: 'command' },
    { value: '/reasoning', display: '/reasoning <level>', hint: 'low|medium|high', type: 'command' },
    { value: '/memory', display: '/memory', hint: 'Project memory', type: 'command' },
    { value: '/exit', display: '/exit', hint: 'Exit OMK', type: 'command' },
    { value: '/quit', display: '/quit', hint: 'Exit OMK', type: 'command' },
  ];

  private readonly tools: Suggestion[] = [
    { value: '$read_file', display: '$read_file', hint: 'Read file', type: 'tool' },
    { value: '$write_file', display: '$write_file', hint: 'Write file', type: 'tool' },
    { value: '$list_directory', display: '$list_directory', hint: 'List dir', type: 'tool' },
    { value: '$search_files', display: '$search_files', hint: 'Search files', type: 'tool' },
    { value: '$web_fetch', display: '$web_fetch', hint: 'Fetch URL', type: 'tool' },
    { value: '$diagnostics', display: '$diagnostics', hint: 'TypeScript check', type: 'tool' },
    { value: '$document_symbols', display: '$document_symbols', hint: 'Get symbols', type: 'tool' },
    { value: '$find_references', display: '$find_references', hint: 'Find refs', type: 'tool' },
    { value: '$execute_command', display: '$execute_command', hint: 'Run command', type: 'tool' },
    { value: '$memory_read', display: '$memory_read', hint: 'Read memory', type: 'tool' },
    { value: '$memory_write', display: '$memory_write', hint: 'Write memory', type: 'tool' },
  ];

  private readonly skills: Suggestion[] = [
    { value: '$ralph', display: '$ralph', hint: 'Persistent task', type: 'skill' },
    { value: '$team', display: '$team', hint: 'Multi-agent', type: 'skill' },
    { value: '$plan', display: '$plan', hint: 'Create plan', type: 'skill' },
    { value: '$deep-interview', display: '$deep-interview', hint: 'Requirements', type: 'skill' },
    { value: '$autopilot', display: '$autopilot', hint: 'Full pipeline', type: 'skill' },
    { value: '$code-review', display: '$code-review', hint: 'Review code', type: 'skill' },
    { value: '$security-review', display: '$security-review', hint: 'Security audit', type: 'skill' },
    { value: '$git-master', display: '$git-master', hint: 'Git ops', type: 'skill' },
    { value: '$build-fix', display: '$build-fix', hint: 'Fix build', type: 'skill' },
    { value: '$tdd', display: '$tdd', hint: 'Test-driven dev', type: 'skill' },
    { value: '$analyze', display: '$analyze', hint: 'Analyze code', type: 'skill' },
    { value: '$visual-verdict', display: '$visual-verdict', hint: 'Visual QA', type: 'skill' },
    { value: '$cancel', display: '$cancel', hint: 'Cancel mode', type: 'skill' },
    { value: '$help', display: '$help', hint: 'Skill help', type: 'skill' },
  ];

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /**
   * Start interactive prompt
   */
  async prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.isActive = true;
      this.input = '';
      this.cursor = 0;
      this.suggestions = [];
      this.selectedIndex = 0;
      this.mode = 'normal';

      this.setupInput();
      this.render();
    });
  }

  /**
   * Setup input handling
   */
  private setupInput(): void {
    // Enable raw mode
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding('utf8');

    stdin.on('data', (key: string) => {
      this.handleKey(key);
    });
  }

  /**
   * Handle keypress
   */
  private handleKey(key: string): void {
    const charCode = key.charCodeAt(0);

    // Ctrl+C
    if (key === '\u0003') {
      this.cleanup();
      process.exit(0);
    }

    // Enter
    if (key === '\r' || key === '\n') {
      this.selectSuggestion();
      return;
    }

    // Tab - accept suggestion
    if (key === '\t') {
      if (this.suggestions.length > 0) {
        this.input = this.suggestions[this.selectedIndex].value;
        this.cursor = this.input.length;
        this.updateSuggestions();
        this.render();
      }
      return;
    }

    // Escape - cancel
    if (key === '\u001b' || charCode === 27) {
      if (key.length > 1 && (key[1] === '[' || key[1] === 'O')) {
        // Arrow key sequence
        this.handleArrowKey(key);
      } else {
        // Just escape - clear suggestions
        this.suggestions = [];
        this.render();
      }
      return;
    }

    // Backspace
    if (charCode === 127 || charCode === 8) {
      if (this.cursor > 0) {
        this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
        this.cursor--;
        this.updateSuggestions();
        this.render();
      }
      return;
    }

    // Ctrl+U - clear line
    if (charCode === 21) {
      this.input = '';
      this.cursor = 0;
      this.updateSuggestions();
      this.render();
      return;
    }

    // Regular character
    if (charCode >= 32 && charCode < 127) {
      this.input = this.input.slice(0, this.cursor) + key + this.input.slice(this.cursor);
      this.cursor++;
      this.updateSuggestions();
      this.render();
    }
  }

  /**
   * Handle arrow keys
   */
  private handleArrowKey(key: string): void {
    if (key === '\u001b[A' || key === '\u001bOA') {
      // Up - move selection up
      if (this.suggestions.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.render();
      }
    } else if (key === '\u001b[B' || key === '\u001bOB') {
      // Down - move selection down
      if (this.suggestions.length > 0) {
        this.selectedIndex = Math.min(this.suggestions.length - 1, this.selectedIndex + 1);
        this.render();
      }
    } else if (key === '\u001b[C' || key === '\u001bOC') {
      // Right - move cursor
      if (this.cursor < this.input.length) {
        this.cursor++;
        this.render();
      }
    } else if (key === '\u001b[D' || key === '\u001bOD') {
      // Left - move cursor
      if (this.cursor > 0) {
        this.cursor--;
        this.render();
      }
    }
  }

  /**
   * Update suggestions based on input
   */
  private updateSuggestions(): void {
    const input = this.input;
    
    if (input.startsWith('/')) {
      this.mode = 'command';
      this.suggestions = this.commands.filter(cmd =>
        cmd.value.startsWith(input) || 
        cmd.value.includes(input.slice(1))
      );
    } else if (input.startsWith('$')) {
      this.mode = 'tool';
      const allTools = [...this.tools, ...this.skills];
      this.suggestions = allTools.filter(tool =>
        tool.value.startsWith(input) ||
        tool.value.includes(input.slice(1))
      );
    } else if (input.includes('@')) {
      this.mode = 'file';
      const atIndex = input.lastIndexOf('@');
      const searchTerm = input.slice(atIndex + 1).toLowerCase();
      this.suggestions = this.getFileSuggestions(searchTerm, input.slice(0, atIndex + 1));
    } else {
      this.mode = 'normal';
      this.suggestions = [];
    }

    // Reset selection
    this.selectedIndex = 0;
    
    // Limit suggestions
    if (this.suggestions.length > 10) {
      this.suggestions = this.suggestions.slice(0, 10);
    }
  }

  /**
   * Get file suggestions - recursive search all files
   */
  private getFileSuggestions(searchTerm: string, prefix: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const added = new Set<string>();
    
    try {
      this.findFilesRecursive(this.cwd, '', searchTerm, suggestions, added, prefix);
    } catch {
      // Ignore errors
    }
    
    // Sort: exact name matches first, then by path length
    suggestions.sort((a, b) => {
      const aName = a.display.split('/').pop()?.toLowerCase() || '';
      const bName = b.display.split('/').pop()?.toLowerCase() || '';
      const aExact = aName.includes(searchTerm);
      const bExact = bName.includes(searchTerm);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.display.length - b.display.length;
    });
    
    return suggestions.slice(0, 20);
  }

  /**
   * Recursively find all files
   */
  private findFilesRecursive(
    dir: string,
    relativePath: string,
    searchTerm: string,
    suggestions: Suggestion[],
    added: Set<string>,
    prefix: string
  ): void {
    let entries: Dirent[] = [];
    
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    
    for (const entry of entries) {
      // Skip hidden and common non-code directories
      if (entry.name.startsWith('.')) continue;
      if (['node_modules', 'dist', 'build', 'target', '.git', 'coverage', '__pycache__', '.next', '.nuxt'].includes(entry.name)) continue;
      
      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const nameLower = entry.name.toLowerCase();
      const matchesSearch = !searchTerm || nameLower.includes(searchTerm) || entryRelativePath.toLowerCase().includes(searchTerm);
      
      if (entry.isDirectory()) {
        // Add directory
        if (matchesSearch) {
          const display = `@${entryRelativePath}/`;
          if (!added.has(display)) {
            added.add(display);
            suggestions.push({
              value: prefix + entryRelativePath + '/',
              display: display,
              hint: 'directory',
              type: 'file',
            });
          }
        }
        
        // Recurse (limit depth indirectly by suggestion count)
        if (suggestions.length < 100) {
          this.findFilesRecursive(
            `${dir}/${entry.name}`,
            entryRelativePath,
            searchTerm,
            suggestions,
            added,
            prefix
          );
        }
      } else if (entry.isFile() && matchesSearch) {
        // Add file
        const ext = extname(entry.name);
        const display = `@${entryRelativePath}`;
        
        if (!added.has(display)) {
          added.add(display);
          suggestions.push({
            value: prefix + entryRelativePath,
            display: display,
            hint: ext.slice(1) || 'file',
            type: 'file',
          });
        }
      }
    }
  }

  /**
   * Select current suggestion
   */
  private selectSuggestion(): void {
    if (this.suggestions.length > 0 && 
        (this.mode === 'command' || this.mode === 'tool' || this.mode === 'file')) {
      this.input = this.suggestions[this.selectedIndex].value;
    }
    
    this.cleanup();
    if (this.resolvePromise) {
      this.resolvePromise(this.input);
    }
  }

  /**
   * Render prompt and suggestions
   */
  private render(): void {
    // Clear lines
    stdout.write('\x1b[2K\r');
    
    // Show prompt (without ANSI codes for position calc)
    const promptText = 'omk > ';
    const prompt = '\x1b[32momk\x1b[0m > ';
    stdout.write(prompt);
    
    // Show input
    stdout.write(this.input);
    
    // Position cursor (promptText.length = visible characters only)
    const cursorCol = promptText.length + this.cursor + 1; // 1-based column
    stdout.write(`\x1b[${cursorCol}G`);
    
    // Show suggestions
    if (this.suggestions.length > 0) {
      stdout.write('\n');
      
      for (let i = 0; i < this.suggestions.length; i++) {
        const sug = this.suggestions[i];
        const isSelected = i === this.selectedIndex;
        
        if (isSelected) {
          stdout.write('\x1b[7m'); // Invert colors
        }
        
        // Type indicator
        let icon = '  ';
        if (sug.type === 'command') icon = '\x1b[36m/ \x1b[0m';
        else if (sug.type === 'tool') icon = '\x1b[33m$ \x1b[0m';
        else if (sug.type === 'skill') icon = '\x1b[35m$ \x1b[0m';
        else if (sug.type === 'file') icon = '\x1b[32m@ \x1b[0m';
        
        stdout.write(`${icon}${sug.display.padEnd(25)}`);
        
        if (sug.hint) {
          stdout.write(`\x1b[90m${sug.hint}\x1b[0m`);
        }
        
        if (isSelected) {
          stdout.write('\x1b[0m'); // Reset
        }
        
        if (i < this.suggestions.length - 1) {
          stdout.write('\n');
        }
      }
      
      // Move cursor back up
      stdout.write(`\x1b[${this.suggestions.length}A`);
      // Position cursor correctly (recalculate without ANSI codes)
      const finalCursorCol = 'omk > '.length + this.cursor + 1;
      stdout.write(`\x1b[${finalCursorCol}G`);
    }
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.isActive = false;
    
    // Clear suggestions lines
    if (this.suggestions.length > 0) {
      stdout.write(`\x1b[${this.suggestions.length}B`);
      for (let i = 0; i < this.suggestions.length; i++) {
        stdout.write('\x1b[2K\r');
        if (i < this.suggestions.length - 1) {
          stdout.write('\n');
        }
      }
      stdout.write(`\x1b[${this.suggestions.length}A`);
    }
    
    stdout.write('\n');
    
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeAllListeners('data');
  }
}
