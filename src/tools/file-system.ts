/**
 * File System Tools
 * Provides $read_file, $write_file, $list_directory, $search_files
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { execSync } from 'child_process';

export interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface WriteFileInput {
  path: string;
  content: string;
  append?: boolean;
}

export interface ListDirectoryInput {
  path: string;
  recursive?: boolean;
}

export interface SearchFilesInput {
  path: string;
  pattern: string;
  filePattern?: string;
}

export class FileSystemTools {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  readFile(input: ReadFileInput): { content: string; size: number; truncated: boolean } {
    const fullPath = resolve(this.cwd, input.path);
    
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${input.path}`);
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${input.path}`);
    }

    let content = readFileSync(fullPath, 'utf-8');
    const size = content.length;
    let truncated = false;

    if (input.offset && input.offset > 0) {
      content = content.slice(input.offset);
    }

    const limit = input.limit || 10000;
    if (content.length > limit) {
      content = content.slice(0, limit) + '\n... (truncated)';
      truncated = true;
    }

    return { content, size, truncated };
  }

  writeFile(input: WriteFileInput): { success: boolean; path: string; bytesWritten: number } {
    const fullPath = resolve(this.cwd, input.path);
    
    const dir = dirname(fullPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (input.append) {
      writeFileSync(fullPath, input.content, { flag: 'a' });
    } else {
      writeFileSync(fullPath, input.content);
    }

    return {
      success: true,
      path: input.path,
      bytesWritten: input.content.length,
    };
  }

  listDirectory(input: ListDirectoryInput): { entries: Array<{ name: string; type: 'file' | 'directory'; size?: number }>; path: string } {
    const fullPath = resolve(this.cwd, input.path);
    
    if (!existsSync(fullPath)) {
      throw new Error(`Directory not found: ${input.path}`);
    }

    const stat = statSync(fullPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${input.path}`);
    }

    const entries: Array<{ name: string; type: 'file' | 'directory'; size?: number }> = [];

    if (input.recursive) {
      this.listRecursive(fullPath, '', entries);
    } else {
      const items = readdirSync(fullPath, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') && item.name !== '.github') continue;
        
        const itemStat = statSync(join(fullPath, item.name));
        entries.push({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          size: item.isFile() ? itemStat.size : undefined,
        });
      }
    }

    return { entries, path: input.path };
  }

  private listRecursive(basePath: string, relativePath: string, entries: Array<{ name: string; type: 'file' | 'directory'; size?: number }>): void {
    const fullPath = join(basePath, relativePath);
    const items = readdirSync(fullPath, { withFileTypes: true });

    for (const item of items) {
      if (item.name.startsWith('.') && item.name !== '.github') continue;
      if (item.name === 'node_modules' || item.name === '__pycache__') continue;

      const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
      const itemFullPath = join(basePath, itemRelativePath);
      const itemStat = statSync(itemFullPath);

      entries.push({
        name: itemRelativePath,
        type: item.isDirectory() ? 'directory' : 'file',
        size: item.isFile() ? itemStat.size : undefined,
      });

      if (item.isDirectory() && entries.length < 500) {
        this.listRecursive(basePath, itemRelativePath, entries);
      }
    }
  }

  searchFiles(input: SearchFilesInput): { results: Array<{ file: string; line: number; content: string }>; total: number } {
    const fullPath = resolve(this.cwd, input.path);
    
    if (!existsSync(fullPath)) {
      throw new Error(`Path not found: ${input.path}`);
    }

    try {
      let command: string;
      const pattern = input.pattern.replace(/"/g, '\\"');
      
      if (process.platform === 'win32') {
        // Windows fallback
        command = `findstr /s /n /c:"${pattern}" "${fullPath}\\*" 2>nul`;
      } else {
        if (input.filePattern) {
          command = `rg -n "${pattern}" "${fullPath}" --glob "${input.filePattern}" 2>/dev/null || grep -rn "${pattern}" "${fullPath}" --include="${input.filePattern}" 2>/dev/null`;
        } else {
          command = `rg -n "${pattern}" "${fullPath}" 2>/dev/null || grep -rn "${pattern}" "${fullPath}" 2>/dev/null`;
        }
      }

      const output = execSync(command, { encoding: 'utf-8', cwd: this.cwd });
      const lines = output.split('\n').filter(l => l.trim());
      
      const results = lines.slice(0, 50).map(line => {
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

      return { results, total: lines.length };
    } catch {
      return { results: [], total: 0 };
    }
  }
}

let tools: FileSystemTools | null = null;

export function getFileSystemTools(cwd?: string): FileSystemTools {
  if (!tools || cwd) {
    tools = new FileSystemTools(cwd);
  }
  return tools;
}
