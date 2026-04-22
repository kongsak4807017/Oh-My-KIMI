/**
 * Interactive Autocomplete Prompt with Assist Suggestions
 * Custom implementation for IDE-style autocomplete with comprehensive guides
 */

import { stdin, stdout } from 'process';
import { readdirSync, Dirent } from 'fs';
import { join, extname } from 'path';
import {
  AssistItem,
  getAssistGuide,
  searchAssistItems,
  formatAssistItems,
  getDetailedHelp,
  discoverAllSkills,
  getAllTools,
  getAllCommands,
} from './assist-suggestion.js';

export { Suggestion } from './assist-suggestion.js';
export type { AssistItem };

// Unicode grapheme and width helpers
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new (Intl as any).Segmenter('en', { granularity: 'grapheme' })
  : null;

function getGraphemeClusters(str: string): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(str), (s: any) => s.segment);
  }
  return Array.from(str);
}

function isZeroWidth(code: number): boolean {
  return (
    code === 0x200B ||
    code === 0x200C ||
    code === 0x200D ||
    code === 0xFEFF ||
    (code >= 0x0300 && code <= 0x036F) ||
    (code >= 0x1AB0 && code <= 0x1AFF) ||
    (code >= 0x1DC0 && code <= 0x1DFF) ||
    (code >= 0x20D0 && code <= 0x20FF) ||
    (code >= 0xFE20 && code <= 0xFE2F) ||
    (code >= 0x0E31 && code <= 0x0E3A) ||
    (code >= 0x0E47 && code <= 0x0E4E)
  );
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) ||
    (code >= 0xAC00 && code <= 0xD7A3) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE10 && code <= 0xFE19) ||
    (code >= 0xFE30 && code <= 0xFE6F) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ||
    (code >= 0x20000 && code <= 0x2FFFD) ||
    (code >= 0x30000 && code <= 0x3FFFD)
  );
}

function getClusterWidth(cluster: string): number {
  for (const char of cluster) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidth(code)) continue;
    if (isFullWidth(code)) return 2;
    return 1;
  }
  return 0;
}

function getStringWidth(str: string): number {
  return getGraphemeClusters(str).reduce((sum, cluster) => sum + getClusterWidth(cluster), 0);
}

/**
 * Enhanced Interactive Autocomplete with Assist Guide
 */
export class InteractiveAutocomplete {
  private cwd: string;
  private input: string = '';
  private cursor: number = 0;
  private suggestions: AssistItem[] = [];
  private selectedIndex: number = 0;
  private isActive: boolean = false;
  private resolvePromise: ((value: string) => void) | null = null;
  private mode: 'normal' | 'command' | 'tool' | 'file' | 'guide' = 'normal';
  private renderedLines: number = 0;
  private showGuide: boolean = false;
  private guideMode: string = '';

  // Cached data
  private cachedSkills: AssistItem[] | null = null;
  private cachedTools: AssistItem[] | null = null;
  private cachedCommands: AssistItem[] | null = null;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  private getSkills(): AssistItem[] {
    if (!this.cachedSkills) {
      this.cachedSkills = discoverAllSkills(this.cwd);
    }
    return this.cachedSkills;
  }

  private getTools(): AssistItem[] {
    if (!this.cachedTools) {
      this.cachedTools = getAllTools();
    }
    return this.cachedTools;
  }

  private getCommands(): AssistItem[] {
    if (!this.cachedCommands) {
      this.cachedCommands = getAllCommands();
    }
    return this.cachedCommands;
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
      this.renderedLines = 0;
      this.showGuide = false;
      this.guideMode = '';

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

    // Tab - accept suggestion or toggle guide
    if (key === '\t') {
      if (this.suggestions.length > 0) {
        this.input = this.suggestions[this.selectedIndex].value;
        this.cursor = getStringWidth(this.input);
        this.updateSuggestions();
        this.render();
      } else if (this.showGuide) {
        // Toggle guide off if tab pressed in guide mode with no selection
        this.showGuide = false;
        this.render();
      }
      return;
    }

    // Ctrl+G - toggle guide mode
    if (key === '\u0007') {
      this.toggleGuide();
      return;
    }

    // Escape - cancel or clear guide
    if (key === '\u001b' || charCode === 27) {
      if (key.length > 1 && (key[1] === '[' || key[1] === 'O')) {
        // Arrow key sequence
        this.handleArrowKey(key);
      } else {
        // Just escape - clear suggestions or guide
        if (this.showGuide) {
          this.showGuide = false;
        } else if (this.suggestions.length > 0) {
          this.suggestions = [];
        }
        this.render();
      }
      return;
    }

    // Backspace
    if (charCode === 127 || charCode === 8) {
      if (this.cursor > 0) {
        const clusters = getGraphemeClusters(this.input);
        let pos = 0;
        let clusterIndex = 0;
        for (let i = 0; i < clusters.length; i++) {
          const w = getClusterWidth(clusters[i]);
          if (pos + w > this.cursor) {
            clusterIndex = i;
            break;
          }
          pos += w;
          clusterIndex = i + 1;
        }
        if (pos === this.cursor && clusterIndex > 0) {
          clusterIndex--;
        }
        const removedWidth = getClusterWidth(clusters[clusterIndex]);
        const before = clusters.slice(0, clusterIndex);
        const after = clusters.slice(clusterIndex + 1);
        this.input = before.join('') + after.join('');
        this.cursor = Math.max(0, this.cursor - removedWidth);
        this.updateSuggestions();
        this.render();
      }
      return;
    }

    // Ctrl+U - clear line
    if (charCode === 21) {
      this.input = '';
      this.cursor = 0;
      this.showGuide = false;
      this.updateSuggestions();
      this.render();
      return;
    }

    // Ctrl+H - show help for current input
    if (charCode === 8) {
      this.showHelp();
      return;
    }

    // Regular character (including Unicode/Thai)
    // Accept any printable char except control chars we already handled
    if (charCode >= 32 && charCode !== 127) {
      const clusters = getGraphemeClusters(this.input);
      let pos = 0;
      let insertIndex = 0;
      for (let i = 0; i < clusters.length; i++) {
        const w = getClusterWidth(clusters[i]);
        if (pos + w > this.cursor) {
          insertIndex = i;
          break;
        }
        pos += w;
        insertIndex = i + 1;
      }
      const before = clusters.slice(0, insertIndex);
      const after = clusters.slice(insertIndex);
      this.input = before.join('') + key + after.join('');
      this.cursor += getStringWidth(key);
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
      // Right - move cursor to next grapheme boundary
      const inputWidth = getStringWidth(this.input);
      if (this.cursor < inputWidth) {
        const clusters = getGraphemeClusters(this.input);
        let pos = 0;
        for (const cluster of clusters) {
          const w = getClusterWidth(cluster);
          if (pos + w > this.cursor) {
            this.cursor = pos + w;
            break;
          }
          pos += w;
        }
        this.render();
      }
    } else if (key === '\u001b[D' || key === '\u001bOD') {
      // Left - move cursor to previous grapheme boundary
      if (this.cursor > 0) {
        const clusters = getGraphemeClusters(this.input);
        let pos = 0;
        for (const cluster of clusters) {
          const w = getClusterWidth(cluster);
          if (pos + w >= this.cursor) {
            this.cursor = pos;
            break;
          }
          pos += w;
        }
        this.render();
      }
    }
  }

  /**
   * Toggle guide mode
   */
  private toggleGuide(): void {
    if (this.input.startsWith('/')) {
      this.showGuide = !this.showGuide;
      this.guideMode = '/';
      this.updateSuggestions();
      this.render();
    } else if (this.input.startsWith('$')) {
      this.showGuide = !this.showGuide;
      this.guideMode = '$';
      this.updateSuggestions();
      this.render();
    } else {
      // Show quick help for prefixes
      this.showGuide = !this.showGuide;
      this.guideMode = 'help';
      this.render();
    }
  }

  /**
   * Show detailed help for current input
   */
  private showHelp(): void {
    if (!this.input.trim()) return;
    
    const help = getDetailedHelp(this.input.trim(), this.cwd);
    this.clearPreviousRender();
    console.log('\n' + help + '\n');
    this.render();
  }

  /**
   * Update suggestions based on input
   */
  private updateSuggestions(): void {
    const input = this.input;
    
    if (input.startsWith('/')) {
      this.mode = 'command';
      if (this.showGuide && this.guideMode === '/') {
        // Show all commands in guide mode
        this.suggestions = this.getCommands();
      } else {
        this.suggestions = searchAssistItems(input, this.cwd);
      }
    } else if (input.startsWith('$')) {
      this.mode = 'tool';
      if (this.showGuide && this.guideMode === '$') {
        // Show all skills and tools in guide mode
        this.suggestions = [...this.getSkills(), ...this.getTools()];
      } else {
        this.suggestions = searchAssistItems(input, this.cwd);
      }
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
    if (this.suggestions.length > 20) {
      this.suggestions = this.suggestions.slice(0, 20);
    }
  }

  /**
   * Get file suggestions - recursive search all files
   */
  private getFileSuggestions(searchTerm: string, prefix: string): AssistItem[] {
    const suggestions: AssistItem[] = [];
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
    suggestions: AssistItem[],
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
   * Clear previously rendered lines (handles wrapped input)
   */
  private clearPreviousRender(): void {
    if (this.renderedLines <= 1) {
      stdout.write('\x1b[2K\r');
      return;
    }
    // Move to the beginning of the first rendered line
    stdout.write('\r');
    stdout.write(`\x1b[${this.renderedLines - 1}A`);
    // Clear everything from cursor to end of screen
    stdout.write('\x1b[J');
  }

  /**
   * Render the guide/help panel
   */
  private renderGuide(): string[] {
    const lines: string[] = [];
    
    if (this.guideMode === 'help') {
      lines.push('\x1b[36m💡 Quick Guide\x1b[0m');
      lines.push('');
      lines.push('\x1b[90mPrefixes:\x1b[0m');
      lines.push('  \x1b[36m/\x1b[0m - Commands for session, context, system');
      lines.push('  \x1b[35m$\x1b[0m - Skills & Tools for task execution');
      lines.push('  \x1b[32m@\x1b[0m - Reference files in your project');
      lines.push('');
      lines.push('\x1b[90mShortcuts:\x1b[0m');
      lines.push('  \x1b[90mCtrl+G\x1b[0m - Toggle guide mode');
      lines.push('  \x1b[90mTab\x1b[0m    - Accept suggestion');
      lines.push('  \x1b[90mEsc\x1b[0m    - Clear suggestions');
      lines.push('  \x1b[90m↑/↓\x1b[0m    - Navigate suggestions');
      return lines;
    }
    
    const guide = getAssistGuide(this.guideMode || this.input[0] || '/', this.cwd);
    
    lines.push(`\x1b[36m${guide.title}\x1b[0m \x1b[90m(${guide.items.length} items)\x1b[0m`);
    lines.push(`\x1b[90m${guide.description}\x1b[0m`);
    lines.push('');
    
    // Show categorized items
    const grouped = new Map<string, AssistItem[]>();
    for (const item of guide.items.slice(0, 15)) {
      const cat = item.category || 'Other';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(item);
    }
    
    for (const [category, items] of grouped) {
      lines.push(`\x1b[90m${category}:\x1b[0m`);
      for (const item of items.slice(0, 5)) {
        let icon = '  ';
        if (item.type === 'command') icon = '\x1b[36m/ \x1b[0m';
        else if (item.type === 'tool') icon = '\x1b[33m$ \x1b[0m';
        else if (item.type === 'skill') icon = '\x1b[35m$ \x1b[0m';
        
        const display = item.display.padEnd(20);
        const hint = item.hint ? `\x1b[90m${item.hint.slice(0, 30)}\x1b[0m` : '';
        lines.push(`  ${icon}${display}${hint}`);
      }
      if (items.length > 5) {
        lines.push(`  \x1b[90m... and ${items.length - 5} more\x1b[0m`);
      }
      lines.push('');
    }
    
    lines.push('\x1b[90mPress Ctrl+G or Esc to close guide\x1b[0m');
    return lines;
  }

  /**
   * Render prompt and suggestions
   */
  private render(): void {
    this.clearPreviousRender();

    const promptText = 'omk > ';
    const prompt = '\x1b[32momk\x1b[0m > ';
    const termWidth = stdout.columns || 80;
    const promptWidth = getStringWidth(promptText);
    const inputWidth = getStringWidth(this.input);

    // Print prompt and input
    stdout.write(prompt + this.input);

    // Calculate how many physical lines the input occupies
    const totalVisibleWidth = promptWidth + inputWidth;
    const inputLines = Math.max(1, Math.ceil(totalVisibleWidth / termWidth));
    let totalLines = inputLines;

    // Show guide if enabled
    if (this.showGuide) {
      stdout.write('\n');
      const guideLines = this.renderGuide();
      for (let i = 0; i < guideLines.length; i++) {
        stdout.write(guideLines[i]);
        if (i < guideLines.length - 1) {
          stdout.write('\n');
        }
      }
      totalLines += guideLines.length;
      
      // Move cursor back up to the input area
      stdout.write(`\x1b[${guideLines.length}A`);
    }
    // Show suggestions if not in guide mode
    else if (this.suggestions.length > 0) {
      stdout.write('\n');

      // Group suggestions by category
      const grouped = new Map<string, AssistItem[]>();
      for (const item of this.suggestions) {
        const cat = item.category || 'Other';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(item);
      }

      let displayIndex = 0;
      let linesWritten = 0;

      for (const [category, items] of grouped) {
        // Category header
        if (grouped.size > 1 && items.length > 0) {
          stdout.write(`\x1b[90m${category}:\x1b[0m\n`);
          linesWritten++;
        }

        for (let i = 0; i < items.length; i++) {
          const sug = items[i];
          const isSelected = displayIndex === this.selectedIndex;

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

          displayIndex++;
          linesWritten++;
          
          if (displayIndex < this.suggestions.length) {
            stdout.write('\n');
          }
        }
      }

      // Move cursor back up to the input area
      stdout.write(`\x1b[${linesWritten}A`);
      totalLines += linesWritten;
    }

    // Position cursor within the input (accounting for line wrapping)
    const cursorVisualOffset = promptWidth + this.cursor;
    const cursorLine = Math.max(0, Math.floor(cursorVisualOffset / termWidth));
    const cursorCol = (cursorVisualOffset % termWidth) + 1;
    const endOfInputLine = Math.max(0, Math.floor((promptWidth + inputWidth) / termWidth));

    const linesUp = endOfInputLine - cursorLine;
    if (linesUp > 0) {
      stdout.write(`\x1b[${linesUp}A`);
    }

    stdout.write(`\x1b[${cursorCol}G`);

    this.renderedLines = totalLines;
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.isActive = false;
    this.clearPreviousRender();
    stdout.write('\n');
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeAllListeners('data');
  }
}
