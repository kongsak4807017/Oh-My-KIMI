/**
 * Memory & Notepad Tools
 * Persistent project memory (like OMX)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ProjectMemory {
  techStack?: string;
  build?: string;
  conventions?: string;
  structure?: string;
  notes: Array<{ category: string; content: string; timestamp: string }>;
  directives: Array<{ directive: string; priority: 'high' | 'normal'; context?: string; timestamp: string }>;
}

export class MemoryTools {
  private cwd: string;
  private omkDir: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.omkDir = join(cwd, '.omk');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.omkDir)) {
      mkdirSync(this.omkDir, { recursive: true });
    }
  }

  private getMemoryPath(): string {
    return join(this.omkDir, 'project-memory.json');
  }

  private getNotepadPath(): string {
    return join(this.omkDir, 'notepad.md');
  }

  /**
   * Read project memory
   */
  readMemory(section?: keyof ProjectMemory): ProjectMemory | any {
    const memoryPath = this.getMemoryPath();
    
    let memory: ProjectMemory = {
      notes: [],
      directives: [],
    };

    if (existsSync(memoryPath)) {
      try {
        const content = readFileSync(memoryPath, 'utf-8');
        memory = JSON.parse(content);
      } catch {
        // Invalid JSON, use default
      }
    }

    if (section) {
      return memory[section as keyof ProjectMemory];
    }

    return memory;
  }

  /**
   * Write project memory
   */
  writeMemory(memory: Partial<ProjectMemory>, merge: boolean = true): void {
    const memoryPath = this.getMemoryPath();
    
    let existing: ProjectMemory = {
      notes: [],
      directives: [],
    };

    if (merge && existsSync(memoryPath)) {
      try {
        existing = JSON.parse(readFileSync(memoryPath, 'utf-8'));
      } catch {
        // Ignore
      }
    }

    const merged: ProjectMemory = {
      ...existing,
      ...memory,
      notes: merge ? [...existing.notes, ...(memory.notes || [])] : (memory.notes || []),
      directives: merge ? [...existing.directives, ...(memory.directives || [])] : (memory.directives || []),
    };

    writeFileSync(memoryPath, JSON.stringify(merged, null, 2));
  }

  /**
   * Add a note
   */
  addNote(category: string, content: string): void {
    const memory = this.readMemory() as ProjectMemory;
    memory.notes.push({
      category,
      content,
      timestamp: new Date().toISOString(),
    });
    this.writeMemory({ notes: memory.notes }, false);
  }

  /**
   * Add a directive
   */
  addDirective(directive: string, priority: 'high' | 'normal' = 'normal', context?: string): void {
    const memory = this.readMemory() as ProjectMemory;
    memory.directives.push({
      directive,
      priority,
      context,
      timestamp: new Date().toISOString(),
    });
    this.writeMemory({ directives: memory.directives }, false);
  }

  /**
   * Read notepad
   */
  readNotepad(section?: 'all' | 'priority' | 'working' | 'manual'): string {
    const notepadPath = this.getNotepadPath();
    
    if (!existsSync(notepadPath)) {
      return '';
    }

    const content = readFileSync(notepadPath, 'utf-8');
    
    if (!section || section === 'all') {
      return content;
    }

    // Parse sections
    const sections = content.split(/^## /m);
    const target = sections.find(s => s.startsWith(section));
    return target ? `## ${target}` : '';
  }

  /**
   * Write to notepad section
   */
  writeNotepad(section: 'priority' | 'working' | 'manual', content: string): void {
    const notepadPath = this.getNotepadPath();
    
    let existing = '';
    if (existsSync(notepadPath)) {
      existing = readFileSync(notepadPath, 'utf-8');
    }

    const timestamp = new Date().toISOString();
    const entry = `\n## ${section}\n**${timestamp}**\n\n${content}\n`;

    if (section === 'priority') {
      // Replace priority section
      writeFileSync(notepadPath, entry + existing.replace(/## priority[\s\S]*?(?=##|$)/, ''));
    } else {
      // Append
      writeFileSync(notepadPath, existing + entry);
    }
  }

  /**
   * Format memory for AI context
   */
  formatForAI(): string {
    const memory = this.readMemory() as ProjectMemory;
    let output = '# Project Context\n\n';

    if (memory.techStack) {
      output += `**Tech Stack:** ${memory.techStack}\n\n`;
    }
    if (memory.build) {
      output += `**Build:** ${memory.build}\n\n`;
    }
    if (memory.conventions) {
      output += `**Conventions:** ${memory.conventions}\n\n`;
    }

    if (memory.directives.length > 0) {
      output += '**Directives:**\n';
      for (const d of memory.directives.slice(-5)) {
        output += `- [${d.priority.toUpperCase()}] ${d.directive}\n`;
      }
      output += '\n';
    }

    if (memory.notes.length > 0) {
      output += '**Recent Notes:**\n';
      for (const n of memory.notes.slice(-5)) {
        output += `- [${n.category}] ${n.content.slice(0, 100)}\n`;
      }
    }

    return output;
  }
}

let tools: MemoryTools | null = null;

export function getMemoryTools(cwd?: string): MemoryTools {
  if (!tools || cwd) {
    tools = new MemoryTools(cwd);
  }
  return tools;
}
