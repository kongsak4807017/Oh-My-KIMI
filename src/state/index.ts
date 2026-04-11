/**
 * OMK State Management
 * Handles persistence of mode state, tasks, and session data
 * Supports global fallback when local .omk doesn't exist
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const OMK_DIR = '.omk';
const GLOBAL_OMK_DIR = join(homedir(), '.omk');
const STATE_DIR = 'state';
const NOTEPAD_FILE = 'notepad.md';

// Global path utilities
function getGlobalOmkPath(): string {
  return GLOBAL_OMK_DIR;
}

function getGlobalStatePath(): string {
  return join(GLOBAL_OMK_DIR, STATE_DIR);
}

function ensureGlobalStateDir(): void {
  const globalStatePath = getGlobalStatePath();
  if (!existsSync(globalStatePath)) {
    mkdirSync(globalStatePath, { recursive: true });
  }
}

/**
 * Determine whether to use local or global state path
 * Prefers local, falls back to global if local doesn't exist
 */
function getEffectiveOmkPath(cwd: string = process.cwd()): string {
  const localPath = join(cwd, OMK_DIR);
  if (existsSync(localPath)) {
    return localPath;
  }
  return getGlobalOmkPath();
}

/**
 * Determine whether to use local or global state path
 */
function getEffectiveStatePath(cwd: string = process.cwd()): string {
  const localPath = join(cwd, OMK_DIR, STATE_DIR);
  if (existsSync(join(cwd, OMK_DIR))) {
    return localPath;
  }
  return getGlobalStatePath();
}

export interface ModeState {
  mode: string;
  active: boolean;
  current_phase: string;
  started_at: string;
  completed_at?: string;
  iteration?: number;
  max_iterations?: number;
  state?: Record<string, unknown>;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ProjectMemory {
  project_name?: string;
  tech_stack?: string[];
  patterns?: string[];
  conventions?: Record<string, string>;
  last_session?: string;
  custom_data?: Record<string, unknown>;
}

// Path utilities
function getOmkPath(cwd: string = process.cwd()): string {
  return join(cwd, OMK_DIR);
}

function getStatePath(cwd: string = process.cwd()): string {
  return join(getOmkPath(cwd), STATE_DIR);
}

function ensureStateDir(cwd: string = process.cwd()): void {
  const statePath = getStatePath(cwd);
  if (!existsSync(statePath)) {
    mkdirSync(statePath, { recursive: true });
  }
}

function ensureEffectiveStateDir(cwd: string = process.cwd()): string {
  const effectivePath = getEffectiveStatePath(cwd);
  if (!existsSync(effectivePath)) {
    mkdirSync(effectivePath, { recursive: true });
  }
  return effectivePath;
}

// Mode state operations
export function writeModeState(
  mode: string, 
  state: Partial<ModeState>, 
  cwd: string = process.cwd()
): void {
  const effectiveStatePath = ensureEffectiveStateDir(cwd);
  const statePath = join(effectiveStatePath, `${mode}-state.json`);
  
  let existing: Partial<ModeState> = {};
  if (existsSync(statePath)) {
    try {
      existing = JSON.parse(readFileSync(statePath, 'utf-8')) as Partial<ModeState>;
    } catch {
      // Ignore malformed state
    }
  }

  const updated: ModeState = {
    mode,
    active: true,
    current_phase: 'initializing',
    started_at: new Date().toISOString(),
    ...existing,
    ...state,
  };

  writeFileSync(statePath, JSON.stringify(updated, null, 2));
}

export function readModeState(mode: string, cwd: string = process.cwd()): ModeState | null {
  // Try local first, then global
  const localPath = join(getStatePath(cwd), `${mode}-state.json`);
  const globalPath = join(getGlobalStatePath(), `${mode}-state.json`);
  
  const statePath = existsSync(localPath) ? localPath : globalPath;
  
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as ModeState;
  } catch {
    return null;
  }
}

export function clearModeState(mode: string, cwd: string = process.cwd()): void {
  // Clear from both local and global
  const localPath = join(getStatePath(cwd), `${mode}-state.json`);
  const globalPath = join(getGlobalStatePath(), `${mode}-state.json`);
  
  if (existsSync(localPath)) {
    rmSync(localPath);
  }
  if (existsSync(globalPath)) {
    rmSync(globalPath);
  }
}

export function listActiveModes(cwd: string = process.cwd()): ModeState[] {
  const activeModes: ModeState[] = [];
  const seenModes = new Set<string>();
  
  // Check both local and global
  const paths = [getStatePath(cwd), getGlobalStatePath()];
  
  for (const statePath of paths) {
    if (!existsSync(statePath)) continue;
    
    const files = readdirSync(statePath);
    
    for (const file of files) {
      if (file.endsWith('-state.json')) {
        try {
          const content = readFileSync(join(statePath, file), 'utf-8');
          const state = JSON.parse(content) as ModeState;
          // Avoid duplicates (local takes precedence)
          if (state.active && !seenModes.has(state.mode)) {
            seenModes.add(state.mode);
            activeModes.push(state);
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  return activeModes;
}

// Task operations
export function createTask(
  task: Omit<Task, 'id' | 'created_at' | 'updated_at'>,
  cwd: string = process.cwd()
): Task {
  const effectiveStatePath = ensureEffectiveStateDir(cwd);
  const tasksPath = join(effectiveStatePath, 'tasks');
  
  if (!existsSync(tasksPath)) {
    mkdirSync(tasksPath, { recursive: true });
  }

  const id = `task-${Date.now()}`;
  const now = new Date().toISOString();
  
  const fullTask: Task = {
    ...task,
    id,
    created_at: now,
    updated_at: now,
  };

  writeFileSync(join(tasksPath, `${id}.json`), JSON.stringify(fullTask, null, 2));
  return fullTask;
}

export function updateTask(
  id: string,
  updates: Partial<Task>,
  cwd: string = process.cwd()
): Task | null {
  // Try local first, then global
  const localPath = join(getStatePath(cwd), 'tasks', `${id}.json`);
  const globalPath = join(getGlobalStatePath(), 'tasks', `${id}.json`);
  const taskPath = existsSync(localPath) ? localPath : globalPath;
  
  
  if (!existsSync(taskPath)) {
    return null;
  }

  try {
    const existing = JSON.parse(readFileSync(taskPath, 'utf-8')) as Task;
    const updated: Task = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      updated_at: new Date().toISOString(),
    };
    
    writeFileSync(taskPath, JSON.stringify(updated, null, 2));
    return updated;
  } catch {
    return null;
  }
}

export function getTask(id: string, cwd: string = process.cwd()): Task | null {
  // Try local first, then global
  const localPath = join(getStatePath(cwd), 'tasks', `${id}.json`);
  const globalPath = join(getGlobalStatePath(), 'tasks', `${id}.json`);
  const taskPath = existsSync(localPath) ? localPath : globalPath;
  
  
  if (!existsSync(taskPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(taskPath, 'utf-8')) as Task;
  } catch {
    return null;
  }
}

export function listTasks(cwd: string = process.cwd()): Task[] {
  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  
  // Check both local and global
  const paths = [join(getStatePath(cwd), 'tasks'), join(getGlobalStatePath(), 'tasks')];
  
  for (const tasksPath of paths) {
    if (!existsSync(tasksPath)) continue;
    
    const files = readdirSync(tasksPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = readFileSync(join(tasksPath, file), 'utf-8');
          const task = JSON.parse(content) as Task;
          // Avoid duplicates (local takes precedence)
          if (!seenIds.has(task.id)) {
            seenIds.add(task.id);
            tasks.push(task);
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  return tasks.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// Notepad operations
export function appendToNotepad(
  content: string,
  cwd: string = process.cwd()
): void {
  const effectiveOmkPath = getEffectiveOmkPath(cwd);
  const notepadPath = join(effectiveOmkPath, NOTEPAD_FILE);
  
  if (!existsSync(effectiveOmkPath)) {
    mkdirSync(effectiveOmkPath, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const entry = `\\n## ${timestamp}\\n\\n${content}\\n`;

  if (existsSync(notepadPath)) {
    const existing = readFileSync(notepadPath, 'utf-8');
    writeFileSync(notepadPath, existing + entry);
  } else {
    writeFileSync(notepadPath, `# OMK Session Notes\\n${entry}`);
  }
}

export function readNotepad(cwd: string = process.cwd()): string {
  // Try local first, then global
  const localPath = join(getOmkPath(cwd), NOTEPAD_FILE);
  const globalPath = join(getGlobalOmkPath(), NOTEPAD_FILE);
  const notepadPath = existsSync(localPath) ? localPath : globalPath;
  
  if (!existsSync(notepadPath)) {
    return '';
  }

  return readFileSync(notepadPath, 'utf-8');
}

// Project memory operations
export function readProjectMemory(cwd: string = process.cwd()): ProjectMemory {
  // Try local first, then global
  const localPath = join(getOmkPath(cwd), 'project-memory.json');
  const globalPath = join(getGlobalOmkPath(), 'project-memory.json');
  const memoryPath = existsSync(localPath) ? localPath : globalPath;
  
  if (!existsSync(memoryPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(memoryPath, 'utf-8')) as ProjectMemory;
  } catch {
    return {};
  }
}

export function writeProjectMemory(
  memory: ProjectMemory,
  cwd: string = process.cwd()
): void {
  const effectiveOmkPath = getEffectiveOmkPath(cwd);
  const memoryPath = join(effectiveOmkPath, 'project-memory.json');
  writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
}

// Context snapshot operations
export function createContextSnapshot(
  slug: string,
  content: {
    task_statement: string;
    desired_outcome: string;
    known_facts: string[];
    constraints: string[];
    unknowns: string[];
    touchpoints: string[];
  },
  cwd: string = process.cwd()
): string {
  const effectiveOmkPath = getEffectiveOmkPath(cwd);
  const contextPath = join(effectiveOmkPath, 'context');
  
  if (!existsSync(contextPath)) {
    mkdirSync(contextPath, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const filename = `${slug}-${timestamp}.md`;
  const filepath = join(contextPath, filename);

  const markdown = `# Context Snapshot: ${slug}

**Created:** ${new Date().toISOString()}

## Task Statement
${content.task_statement}

## Desired Outcome
${content.desired_outcome}

## Known Facts
${content.known_facts.map(f => `- ${f}`).join('\\n')}

## Constraints
${content.constraints.map(c => `- ${c}`).join('\\n')}

## Unknowns / Open Questions
${content.unknowns.map(u => `- ${u}`).join('\\n')}

## Likely Codebase Touchpoints
${content.touchpoints.map(t => `- ${t}`).join('\\n')}
`;

  writeFileSync(filepath, markdown);
  return filepath;
}
