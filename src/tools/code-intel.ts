/**
 * Code Intelligence Tools
 * Provides diagnostics, symbol search, references (like LSP)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';

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
    this.cwd = cwd;
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
    const fullPath = resolve(this.cwd, input.file);
    
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
    const fullPath = resolve(this.cwd, input.file);
    
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
    const fullPath = resolve(this.cwd, input.path);
    
    try {
      const pattern = `^(?:export\s+)?(?:function|class|interface|const|let|var)\s+${input.query}`;
      const command = process.platform === 'win32'
        ? `findstr /s /n /r /c:"${pattern}" "${fullPath}\\*" 2>nul`
        : `grep -rn "${pattern}" "${fullPath}" 2>/dev/null | head -50`;

      const output = execSync(command, { encoding: 'utf-8', cwd: this.cwd });
      
      const lines = output.split('\n').filter(l => l.trim());
      const results = lines.map(line => {
        const match = line.match(/^(.+):(\d+):(.*)$/);
        if (match) {
          return {
            file: relative(this.cwd, match[1]),
            line: parseInt(match[2], 10),
            content: match[3].trim(),
          };
        }
        return null;
      }).filter(Boolean) as Array<{ file: string; line: number; content: string }>;

      return { results };
    } catch {
      return { results: [] };
    }
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
    const fullPath = resolve(this.cwd, input.file);
    
    try {
      const command = process.platform === 'win32'
        ? `findstr /s /n /c:"${input.symbol}" "${this.cwd}\\*" 2>nul`
        : `grep -rn "\\b${input.symbol}\\b" "${this.cwd}" --include="*.ts" --include="*.js" 2>/dev/null | head -100`;

      const output = execSync(command, { encoding: 'utf-8', cwd: this.cwd });
      
      const lines = output.split('\n').filter(l => l.trim());
      const references = lines.map(line => {
        const match = line.match(/^(.+):(\d+):(.*)$/);
        if (match) {
          return {
            file: relative(this.cwd, match[1]),
            line: parseInt(match[2], 10),
            content: match[3].trim(),
          };
        }
        return null;
      }).filter(Boolean) as Array<{ file: string; line: number; content: string }>;

      return { references };
    } catch {
      return { references: [] };
    }
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

let tools: CodeIntelTools | null = null;

export function getCodeIntelTools(cwd?: string): CodeIntelTools {
  if (!tools || cwd) {
    tools = new CodeIntelTools(cwd);
  }
  return tools;
}
