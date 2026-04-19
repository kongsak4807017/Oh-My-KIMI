/**
 * Code Intelligence Tools
 * Provides diagnostics, symbol search, references (like LSP)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, relative, join, sep } from 'path';

export interface DiagnosticsInput {
  file: string;
  severity?: 'error' | 'warning' | 'all';
}

export interface DocumentSymbolsInput {
  file: string;
}

export interface WorkspaceSymbolsInput {
  query: string;
  path: string;
}

export interface FindReferencesInput {
  file: string;
  symbol: string;
}

export interface AstGrepInput {
  pattern: string;
  path: string;
  language: string;
}

export class CodeIntelTools {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
  }

  private resolveInsideWorkspace(inputPath: string): string {
    const fullPath = resolve(this.cwd, inputPath);
    const rel = relative(this.cwd, fullPath);
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))) {
      return fullPath;
    }
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }

  private scanTextFiles(root: string, matchLine: (line: string, file: string) => boolean, maxResults: number): Array<{ file: string; line: number; content: string }> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const visit = (path: string): void => {
      if (results.length >= maxResults) return;
      const stat = statSync(path);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
          visit(join(path, entry.name));
          if (results.length >= maxResults) break;
        }
        return;
      }

      if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt)$/i.test(path) || stat.size > 2_000_000) return;

      let content = '';
      try {
        content = readFileSync(path, 'utf-8');
      } catch {
        return;
      }

      const relPath = relative(this.cwd, path);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (matchLine(lines[i], relPath)) {
          results.push({ file: relPath, line: i + 1, content: lines[i].trim() });
          if (results.length >= maxResults) return;
        }
      }
    };

    visit(root);
    return results;
  }

  /**
   * Run TypeScript diagnostics
   */
  diagnostics(input: DiagnosticsInput): {
    diagnostics: Array<{
      file: string;
      line: number;
      column: number;
      severity: 'error' | 'warning';
      code: string;
      message: string;
    }>;
    errorCount: number;
    warningCount: number;
  } {
    const fullPath = this.resolveInsideWorkspace(input.file);
    
    try {
      // Run tsc --noEmit
      const output = execSync(
        'npx tsc --noEmit --pretty false 2>&1',
        { 
          encoding: 'utf-8', 
          cwd: this.cwd,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      
      return this.parseTscOutput(output, input.severity);
    } catch (err: any) {
      // tsc returns exit code 2 with diagnostics
      if (err.stdout) {
        return this.parseTscOutput(err.stdout, input.severity);
      }
      return { diagnostics: [], errorCount: 0, warningCount: 0 };
    }
  }

  private parseTscOutput(
    output: string, 
    severity?: string
  ): {
    diagnostics: Array<{ file: string; line: number; column: number; severity: 'error' | 'warning'; code: string; message: string }>;
    errorCount: number;
    warningCount: number;
  } {
    const diagnostics: Array<{ file: string; line: number; column: number; severity: 'error' | 'warning'; code: string; message: string }> = [];
    let errorCount = 0;
    let warningCount = 0;

    // Parse: file(line,col): error TScode: message
    const regex = /^(.+)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/gm;
    let match;

    while ((match = regex.exec(output)) !== null) {
      const [, file, line, col, sev, code, message] = match;
      
      if (severity && severity !== 'all' && sev !== severity) continue;

      diagnostics.push({
        file: relative(this.cwd, file),
        line: parseInt(line, 10),
        column: parseInt(col, 10),
        severity: sev as 'error' | 'warning',
        code,
        message: message.trim(),
      });

      if (sev === 'error') errorCount++;
      else warningCount++;
    }

    return { diagnostics: diagnostics.slice(0, 50), errorCount, warningCount };
  }

  /**
   * Extract symbols from a file (functions, classes, etc.)
   */
  documentSymbols(input: DocumentSymbolsInput): {
    symbols: Array<{
      name: string;
      kind: 'function' | 'class' | 'interface' | 'variable' | 'method';
      line: number;
    }>;
  } {
    const fullPath = this.resolveInsideWorkspace(input.file);
    
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${input.file}`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const symbols: Array<{ name: string; kind: 'function' | 'method' | 'class' | 'interface' | 'variable'; line: number }> = [];

    const lines = content.split('\n');

    // Simple regex-based extraction
    const patterns = [
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
      { regex: /^(?:export\s+)?class\s+(\w+)/, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]/, kind: 'variable' },
      { regex: /\s+(\w+)\s*\([^)]*\)\s*\{/, kind: 'method' },
    ];

    lines.forEach((line, index) => {
      for (const { regex, kind } of patterns) {
        const match = line.match(regex);
        if (match) {
          symbols.push({
            name: match[1],
            kind: kind as 'function' | 'method' | 'class' | 'interface' | 'variable',
            line: index + 1,
          });
          break;
        }
      }
    });

    return { symbols };
  }

  /**
   * Search for symbols across workspace
   */
  workspaceSymbols(input: WorkspaceSymbolsInput): {
    results: Array<{
      file: string;
      line: number;
      content: string;
    }>;
  } {
    const fullPath = this.resolveInsideWorkspace(input.path);
    const symbolPattern = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|class|interface|const|let|var)\\s+${escapeRegExp(input.query)}\\b`);
    return {
      results: this.scanTextFiles(fullPath, (line) => symbolPattern.test(line.trim()), 50),
    };
  }

  /**
   * Find all references to a symbol
   */
  findReferences(input: FindReferencesInput): {
    references: Array<{
      file: string;
      line: number;
      content: string;
    }>;
  } {
    this.resolveInsideWorkspace(input.file);
    const symbolPattern = new RegExp(`\\b${escapeRegExp(input.symbol)}\\b`);
    return {
      references: this.scanTextFiles(this.cwd, (line) => symbolPattern.test(line), 100),
    };
  }

  /**
   * AST pattern search (using grep fallback)
   */
  astGrepSearch(input: AstGrepInput): {
    matches: Array<{
      file: string;
      line: number;
      content: string;
    }>;
  } {
    // Convert pattern to regex
    const pattern = input.pattern
      .replace(/\$\$\$\w+/g, '.*') // $$$ARGS -> .*
      .replace(/\$\w+/g, '\\w+'); // $NAME -> \w+

    const result = this.workspaceSymbols({ query: pattern, path: input.path });
    return { matches: result.results };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let tools: CodeIntelTools | null = null;

export function getCodeIntelTools(cwd?: string): CodeIntelTools {
  if (!tools || cwd) {
    tools = new CodeIntelTools(cwd);
  }
  return tools;
}
