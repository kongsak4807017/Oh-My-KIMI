/**
 * OMK State Management
 * Handles persistence of mode state, tasks, and session data
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const OMK_DIR = '.omk';
const STATE_DIR = 'state';
const NOTEPAD_FILE = 'notepad.md';

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

// Mode state operations
export function writeModeState(
  mode: string, 
  state: Partial<ModeState>, 
  cwd: string = process.cwd()
): void {
  ensureStateDir(cwd);
  const statePath = join(getStatePath(cwd), `${mode}-state.json`);
  
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
  const statePath = join(getStatePath(cwd), `${mode}-state.json`);
  
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
  const statePath = join(getStatePath(cwd), `${mode}-state.json`);
  
  if (existsSync(statePath)) {
    rmSync(statePath);
  }
}

export function listActiveModes(cwd: string = process.cwd()): ModeState[] {
  const statePath = getStatePath(cwd);
  
  if (!existsSync(statePath)) {
    return [];
  }

  const files = readdirSync(statePath);
  const activeModes: ModeState[] = [];

  for (const file of files) {
    if (file.endsWith('-state.json')) {
      try {
        const content = readFileSync(join(statePath, file), 'utf-8');
        const state = JSON.parse(content) as ModeState;
        if (state.active) {
          activeModes.push(state);
        }
      } catch {
        // Skip invalid files
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
  ensureStateDir(cwd);
  const tasksPath = join(getStatePath(cwd), 'tasks');
  
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
  const taskPath = join(getStatePath(cwd), 'tasks', `${id}.json`);
  
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
  const taskPath = join(getStatePath(cwd), 'tasks', `${id}.json`);
  
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
  const tasksPath = join(getStatePath(cwd), 'tasks');
  
  if (!existsSync(tasksPath)) {
    return [];
  }

  const files = readdirSync(tasksPath);
  const tasks: Task[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = readFileSync(join(tasksPath, file), 'utf-8');
        tasks.push(JSON.parse(content) as Task);
      } catch {
        // Skip invalid files
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
  const omkPath = getOmkPath(cwd);
  const notepadPath = join(omkPath, NOTEPAD_FILE);
  
  if (!existsSync(omkPath)) {
    mkdirSync(omkPath, { recursive: true });
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
  const notepadPath = join(getOmkPath(cwd), NOTEPAD_FILE);
  
  if (!existsSync(notepadPath)) {
    return '';
  }

  return readFileSync(notepadPath, 'utf-8');
}

// Project memory operations
export function readProjectMemory(cwd: string = process.cwd()): ProjectMemory {
  const memoryPath = join(getOmkPath(cwd), 'project-memory.json');
  
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
  ensureStateDir(cwd);
  const memoryPath = join(getOmkPath(cwd), 'project-memory.json');
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
  const contextPath = join(getOmkPath(cwd), 'context');
  
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
