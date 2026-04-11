/**
 * Codebase Indexer - For large projects (100K+ lines)
 * Indexes files for fast search and smart context selection
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, relative, extname, dirname } from 'path';

export interface Symbol {
  name: string;
  type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'variable' | 'const' | 'enum';
  line: number;
  column: number;
  signature?: string;
  documentation?: string;
  isExported: boolean;
}

export interface FileIndex {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  language: string;
  lastModified: number;
  contentHash: string;
  symbols: Symbol[];
  imports: string[];
  exports: string[];
  dependencies: string[];
  dependents: string[];
}

export interface RepositoryMap {
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  languages: Record<string, { files: number; lines: number; percentage: number }>;
  modules: ModuleInfo[];
  entryPoints: string[];
  keyFiles: string[];
  largestFiles: string[];
  mostImported: string[];
}

export interface ModuleInfo {
  name: string;
  path: string;
  files: number;
  lines: number;
  entryPoints: string[];
  dependencies: string[];
}

export class CodebaseIndexer {
  private cwd: string;
  private index: Map<string, FileIndex> = new Map();
  private isIndexing: boolean = false;

  private readonly CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.kt',
    '.c', '.cpp', '.h', '.hpp', '.rb', '.php', '.swift', '.scala',
    '.cs', '.fs', '.ex', '.exs',
  ]);

  private readonly SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'target', '.next', '.nuxt',
    'coverage', '.cache', 'vendor', '__pycache__', '.tox', '.eggs',
  ]);

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async buildIndex(progressCallback?: (current: number, total: number, file: string) => void): Promise<RepositoryMap> {
    if (this.isIndexing) throw new Error('Indexing already in progress');
    
    this.isIndexing = true;
    this.index.clear();

    try {
      const files = await this.findCodeFiles();
      const total = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await this.indexFile(file);
          if (progressCallback) progressCallback(i + 1, total, file);
        } catch (err) {
          // Skip failed files
        }
      }

      this.buildDependencyGraph();
      return this.generateRepositoryMap();
    } finally {
      this.isIndexing = false;
    }
  }

  private async findCodeFiles(dir: string = this.cwd): Promise<string[]> {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!this.SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          files.push(...await this.findCodeFiles(fullPath));
        }
      } else if (this.CODE_EXTENSIONS.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async indexFile(filePath: string): Promise<void> {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);
    const language = this.detectLanguage(filePath);
    
    this.index.set(filePath, {
      path: filePath,
      relativePath: relative(this.cwd, filePath),
      size: stats.size,
      lines: content.split('\n').length,
      language,
      lastModified: stats.mtimeMs,
      contentHash: this.simpleHash(content),
      symbols: this.extractSymbols(content, language),
      imports: this.extractImports(content, language),
      exports: this.extractExports(content, language),
      dependencies: [],
      dependents: [],
    });
  }

  private detectLanguage(filePath: string): string {
    const ext = extname(filePath);
    const map: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
      '.java': 'Java', '.kt': 'Kotlin',
      '.c': 'C', '.cpp': 'C++', '.h': 'C/C++', '.hpp': 'C++',
      '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift',
    };
    return map[ext] || 'Unknown';
  }

  private extractSymbols(content: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    const patterns: Record<string, RegExp[]> = {
      TypeScript: [
        /^(export\s+)?(class|interface|type|enum|function)\s+(\w+)/,
        /^(export\s+)?const\s+(\w+)\s*[:=]/,
      ],
      Python: [/^class\s+(\w+)/, /^def\s+(\w+)/],
      Rust: [/^pub\s+(fn|struct|enum|trait)\s+(\w+)/],
    };

    const langPatterns = patterns[language] || patterns.TypeScript || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      for (const pattern of langPatterns) {
        const match = line.match(pattern);
        if (match) {
          symbols.push({
            name: match[match.length - 1],
            type: line.includes('class') ? 'class' : 
                  line.includes('interface') ? 'interface' : 'function',
            line: i + 1,
            column: line.indexOf(match[match.length - 1]) + 1,
            isExported: line.startsWith('export') || line.startsWith('pub'),
          });
          break;
        }
      }
    }

    return symbols;
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    const patterns: Record<string, RegExp> = {
      TypeScript: /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      Python: /^(?:from|import)\s+(\w+)/gm,
    };

    const pattern = patterns[language];
    if (!pattern) return imports;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return [...new Set(imports)];
  }

  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];
    if (language === 'TypeScript' || language === 'JavaScript') {
      const pattern = /export\s+(?:default\s+)?(?:class|function|interface)\s+(\w+)/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }
    return exports;
  }

  private buildDependencyGraph(): void {
    for (const [path, index] of this.index) {
      for (const imp of index.imports) {
        const resolved = this.resolveImport(imp, path);
        if (resolved && this.index.has(resolved)) {
          index.dependencies.push(resolved);
          this.index.get(resolved)!.dependents.push(path);
        }
      }
    }
  }

  private resolveImport(importPath: string, fromFile: string): string | null {
    if (!importPath.startsWith('.')) return null;
    const dir = dirname(fromFile);
    const resolved = join(dir, importPath);
    
    for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts']) {
      const fullPath = resolved + ext;
      if (existsSync(fullPath)) return fullPath;
    }
    return null;
  }

  private generateRepositoryMap(): RepositoryMap {
    const files = Array.from(this.index.values());
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    
    const langStats: Record<string, { files: number; lines: number }> = {};
    for (const f of files) {
      langStats[f.language] = langStats[f.language] || { files: 0, lines: 0 };
      langStats[f.language].files++;
      langStats[f.language].lines += f.lines;
    }

    const languages: RepositoryMap['languages'] = {};
    for (const [lang, stats] of Object.entries(langStats)) {
      languages[lang] = { ...stats, percentage: Math.round((stats.lines / totalLines) * 100) };
    }

    const mostImported = files
      .sort((a, b) => b.dependents.length - a.dependents.length)
      .slice(0, 20)
      .map(f => f.relativePath);

    return {
      totalFiles: files.length,
      totalLines,
      totalSymbols: files.reduce((sum, f) => sum + f.symbols.length, 0),
      languages,
      modules: this.detectModules(files),
      entryPoints: files.filter(f => f.relativePath.match(/index\.|main\./)).map(f => f.relativePath),
      keyFiles: mostImported.slice(0, 10),
      largestFiles: files.sort((a, b) => b.lines - a.lines).slice(0, 10).map(f => `${f.relativePath} (${f.lines})`),
      mostImported,
    };
  }

  private detectModules(files: FileIndex[]): ModuleInfo[] {
    const moduleDirs = new Map<string, string[]>();
    for (const f of files) {
      const topDir = f.relativePath.split('/')[0];
      if (!moduleDirs.has(topDir)) moduleDirs.set(topDir, []);
      moduleDirs.get(topDir)!.push(f.relativePath);
    }

    const modules: ModuleInfo[] = [];
    for (const [name, paths] of moduleDirs) {
      if (paths.length > 5) {
        const moduleFiles = paths.map(p => this.index.get(join(this.cwd, p))!).filter(Boolean);
        modules.push({
          name,
          path: name,
          files: paths.length,
          lines: moduleFiles.reduce((sum, f) => sum + f.lines, 0),
          entryPoints: paths.filter(p => p.includes('index.')),
          dependencies: [],
        });
      }
    }
    return modules.sort((a, b) => b.lines - a.lines);
  }

  getSmartContext(query: string, maxFiles: number = 20): Array<{ path: string; content: string; relevance: number }> {
    const keywords = query.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for'].includes(w));
    
    const scored: Array<{ path: string; content: string; relevance: number }> = [];

    for (const [path, index] of this.index) {
      let score = 0;
      
      for (const keyword of keywords) {
        if (index.relativePath.toLowerCase().includes(keyword)) score += 10;
        for (const sym of index.symbols) {
          if (sym.name.toLowerCase().includes(keyword)) score += 5;
          if (sym.name.toLowerCase() === keyword) score += 15;
        }
        for (const exp of index.exports) {
          if (exp.toLowerCase().includes(keyword)) score += 8;
        }
      }
      
      score += Math.min(index.dependents.length, 10);
      
      if (score > 0) {
        try {
          scored.push({
            path: index.relativePath,
            content: readFileSync(path, 'utf-8').slice(0, 5000),
            relevance: score,
          });
        } catch {}
      }
    }

    return scored.sort((a, b) => b.relevance - a.relevance).slice(0, maxFiles);
  }

  getRelatedFiles(filePath: string, depth: number = 2): string[] {
    const related = new Set<string>();
    const visited = new Set<string>();
    
    const traverse = (path: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(path)) return;
      visited.add(path);
      
      const index = this.index.get(path);
      if (!index) return;
      
      for (const dep of [...index.dependencies, ...index.dependents]) {
        related.add(this.index.get(dep)?.relativePath || dep);
        traverse(dep, currentDepth + 1);
      }
    };

    traverse(filePath, 0);
    return Array.from(related);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  getStats() {
    return {
      files: this.index.size,
      symbols: Array.from(this.index.values()).reduce((sum, f) => sum + f.symbols.length, 0),
      isIndexing: this.isIndexing,
    };
  }
}

let indexer: CodebaseIndexer | null = null;
export function getCodebaseIndexer(cwd: string): CodebaseIndexer {
  if (!indexer) indexer = new CodebaseIndexer(cwd);
  return indexer;
}
