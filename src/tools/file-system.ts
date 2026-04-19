/**
 * File System Tools
 * Provides $read_file, $write_file, $list_directory, $search_files
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, relative, resolve, dirname, sep } from 'path';

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

  readFile(input: ReadFileInput): { content: string; size: number; truncated: boolean } {
    const fullPath = this.resolveInsideWorkspace(input.path);
    
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
    const fullPath = this.resolveInsideWorkspace(input.path);
    
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
    const fullPath = this.resolveInsideWorkspace(input.path);
    
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
    const fullPath = this.resolveInsideWorkspace(input.path);
    
    if (!existsSync(fullPath)) {
      throw new Error(`Path not found: ${input.path}`);
    }

    const results: Array<{ file: string; line: number; content: string }> = [];
    const pattern = input.pattern;
    const fileRegex = input.filePattern
      ? new RegExp(`^${input.filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
      : null;

    const visit = (path: string): void => {
      if (results.length >= 50) return;
      const stat = statSync(path);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
          visit(join(path, entry.name));
          if (results.length >= 50) break;
        }
        return;
      }

      const relPath = relative(this.cwd, path);
      if (fileRegex && !fileRegex.test(relPath) && !fileRegex.test(entryName(relPath))) return;
      if (stat.size > 2_000_000) return;

      let content = '';
      try {
        content = readFileSync(path, 'utf-8');
      } catch {
        return;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          results.push({ file: relPath, line: i + 1, content: lines[i].trim() });
          if (results.length >= 50) return;
        }
      }
    };

    visit(fullPath);
    return { results, total: results.length };
  }
}

function entryName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

let tools: FileSystemTools | null = null;

export function getFileSystemTools(cwd?: string): FileSystemTools {
  if (!tools || cwd) {
    tools = new FileSystemTools(cwd);
  }
  return tools;
}
