/**
 * Repository Analyzer - Clone and analyze GitHub repositories
 * Downloads repo and extracts key information for AI analysis
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { tmpdir } from 'os';
import { rmSync, mkdirSync } from 'fs';

export interface RepoInfo {
  name: string;
  url: string;
  localPath: string;
  readme?: string;
  structure: string[];
  keyFiles: { path: string; content: string; size: number }[];
  languages: string[];
}

export class RepoAnalyzer {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'omk-repos');
  }

  /**
   * Clone and analyze a GitHub repository
   */
  async analyzeRepo(url: string): Promise<RepoInfo> {
    const repoName = this.extractRepoName(url);
    const localPath = join(this.tempDir, repoName);

    console.log(`[REPO] Cloning ${repoName}...`);
    
    try {
      // Clean up if exists
      if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true });
      }
      
      mkdirSync(this.tempDir, { recursive: true });

      // Clone the repo (shallow clone for speed)
      await this.cloneRepo(url, localPath);

      console.log(`[REPO] Analyzing structure...`);

      // Extract information
      const readme = this.findReadme(localPath);
      const structure = this.getStructure(localPath);
      const keyFiles = this.extractKeyFiles(localPath);
      const languages = this.detectLanguages(localPath);

      console.log(`[REPO] Found ${structure.length} files, ${languages.length} languages`);

      return {
        name: repoName,
        url,
        localPath,
        readme,
        structure,
        keyFiles,
        languages,
      };

    } catch (err) {
      throw new Error(`Failed to analyze repo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Clone repository using git
   */
  private cloneRepo(url: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use shallow clone (--depth 1) for speed
      const child = spawn('git', ['clone', '--depth', '1', url, localPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let error = '';

      child.stderr?.on('data', (data) => {
        error += data.toString();
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git clone failed: ${error}`));
        }
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        child.kill();
        reject(new Error('Git clone timed out'));
      }, 120000);
    });
  }

  /**
   * Extract repo name from URL
   */
  private extractRepoName(url: string): string {
    // Handle various GitHub URL formats
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return `${match[1]}-${match[2].replace(/\.git$/, '')}`;
    }
    return `repo-${Date.now()}`;
  }

  /**
   * Find and read README file
   */
  private findReadme(localPath: string): string | undefined {
    const readmeFiles = ['README.md', 'README.MD', 'readme.md', 'Readme.md', 'README'];
    
    for (const readmeFile of readmeFiles) {
      const readmePath = join(localPath, readmeFile);
      if (existsSync(readmePath)) {
        const content = readFileSync(readmePath, 'utf-8');
        // Limit to first 10000 chars
        return content.slice(0, 10000);
      }
    }
    
    return undefined;
  }

  /**
   * Get directory structure
   */
  private getStructure(localPath: string, prefix = ''): string[] {
    const structure: string[] = [];
    const entries = readdirSync(localPath);
    
    // Ignore common directories
    const ignoreDirs = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build'];
    
    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.github') continue;
      if (ignoreDirs.includes(entry)) continue;

      const fullPath = join(localPath, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        structure.push(`${prefix}${entry}/`);
        // Limit depth
        if (prefix.length < 20) {
          structure.push(...this.getStructure(fullPath, `${prefix}${entry}/`));
        }
      } else {
        structure.push(`${prefix}${entry}`);
      }
    }
    
    return structure.slice(0, 100); // Limit to 100 entries
  }

  /**
   * Extract key files for analysis
   */
  private extractKeyFiles(localPath: string): { path: string; content: string; size: number }[] {
    const keyFiles: { path: string; content: string; size: number }[] = [];
    
    // Priority files to analyze
    const priorityFiles = [
      'package.json',
      'Cargo.toml',
      'requirements.txt',
      'setup.py',
      'pyproject.toml',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'Makefile',
      'Dockerfile',
      'docker-compose.yml',
      '.github/workflows',
      'src/main',
      'src/index',
      'main.py',
      'app.py',
      'server.py',
      'config',
      'settings',
    ];

    const entries = readdirSync(localPath, { recursive: true }) as string[];
    
    for (const entry of entries) {
      if (typeof entry !== 'string') continue;
      
      const fullPath = join(localPath, entry);
      if (!existsSync(fullPath)) continue;
      
      const stat = statSync(fullPath);
      if (stat.isDirectory()) continue;
      
      // Check if it's a priority file
      const isPriority = priorityFiles.some(pf => entry.toLowerCase().includes(pf.toLowerCase()));
      
      // Limit file size (500KB max)
      if (stat.size > 500000) continue;
      
      // Only text files
      const ext = extname(entry).toLowerCase();
      const textExts = ['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.md', '.txt', '.json', '.toml', '.yaml', '.yml', '.xml', '.gradle', ''];
      
      if (!textExts.includes(ext) && !isPriority) continue;
      
      try {
        const content = readFileSync(fullPath, 'utf-8');
        
        keyFiles.push({
          path: entry,
          content: content.slice(0, 5000), // Limit content
          size: stat.size,
        });
        
        if (keyFiles.length >= 20) break; // Limit to 20 files
      } catch {
        // Skip files that can't be read
      }
    }
    
    return keyFiles;
  }

  /**
   * Detect programming languages used
   */
  private detectLanguages(localPath: string): string[] {
    const extensions: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript (React)',
      '.jsx': 'JavaScript (React)',
      '.py': 'Python',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java',
      '.kt': 'Kotlin',
      '.swift': 'Swift',
      '.cpp': 'C++',
      '.c': 'C',
      '.h': 'C/C++ Header',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.scala': 'Scala',
      '.r': 'R',
      '.m': 'Objective-C',
      '.mm': 'Objective-C++',
      '.dart': 'Dart',
      '.lua': 'Lua',
      '.sh': 'Shell',
      '.ps1': 'PowerShell',
    };

    const found = new Set<string>();
    const entries = readdirSync(localPath, { recursive: true }) as string[];
    
    for (const entry of entries) {
      if (typeof entry !== 'string') continue;
      const ext = extname(entry).toLowerCase();
      if (extensions[ext]) {
        found.add(extensions[ext]);
      }
    }
    
    // Also check for config files
    if (existsSync(join(localPath, 'package.json'))) found.add('Node.js');
    if (existsSync(join(localPath, 'Cargo.toml'))) found.add('Rust');
    if (existsSync(join(localPath, 'go.mod'))) found.add('Go');
    if (existsSync(join(localPath, 'requirements.txt')) || existsSync(join(localPath, 'setup.py'))) found.add('Python');
    if (existsSync(join(localPath, 'pom.xml')) || existsSync(join(localPath, 'build.gradle'))) found.add('Java');
    if (existsSync(join(localPath, 'Dockerfile'))) found.add('Docker');
    
    return Array.from(found);
  }

  /**
   * Clean up downloaded repos
   */
  cleanup(repoPath?: string): void {
    if (repoPath && existsSync(repoPath)) {
      rmSync(repoPath, { recursive: true });
    } else if (existsSync(this.tempDir)) {
      rmSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Format repo info for AI analysis
   */
  formatForAI(info: RepoInfo): string {
    let output = `# Repository Analysis: ${info.name}\n\n`;
    
    output += `**URL:** ${info.url}\n\n`;
    
    if (info.languages.length > 0) {
      output += `**Languages:** ${info.languages.join(', ')}\n\n`;
    }
    
    output += `**Structure:**\n`;
    for (const item of info.structure.slice(0, 30)) {
      output += `- ${item}\n`;
    }
    if (info.structure.length > 30) {
      output += `- ... and ${info.structure.length - 30} more files\n`;
    }
    output += '\n';
    
    if (info.readme) {
      output += `**README (excerpt):**\n\n${info.readme.slice(0, 3000)}\n\n`;
    }
    
    if (info.keyFiles.length > 0) {
      output += `**Key Files:**\n\n`;
      for (const file of info.keyFiles) {
        output += `### ${file.path} (${(file.size / 1024).toFixed(1)} KB)\n\n`;
        output += '```\n';
        output += file.content.slice(0, 2000);
        if (file.content.length > 2000) {
          output += '\n... (truncated)';
        }
        output += '\n```\n\n';
      }
    }
    
    return output;
  }
}

// Singleton
let analyzer: RepoAnalyzer | null = null;

export function getRepoAnalyzer(): RepoAnalyzer {
  if (!analyzer) {
    analyzer = new RepoAnalyzer();
  }
  return analyzer;
}
