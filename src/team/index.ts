/**
 * Team Mode - Multi-agent orchestration with tmux
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { writeModeState, readModeState, clearModeState } from '../state/index.js';

// Team configuration
export interface TeamConfig {
  name: string;
  workerCount: number;
  agentType: string;
  task: string;
  createdAt: string;
  status: 'creating' | 'running' | 'paused' | 'completed' | 'failed';
}

export interface Worker {
  id: string;
  paneId?: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  task?: string;
  inbox?: string;
  outbox?: string;
}

export interface TeamState {
  teamName: string;
  config: TeamConfig;
  workers: Worker[];
  tasks: TeamTask[];
  mailbox: Mailbox;
}

export interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mailbox {
  leader: Message[];
  workers: Record<string, Message[]>;
}

export interface Message {
  from: string;
  to: string;
  type: 'ack' | 'status' | 'result' | 'error' | 'command';
  payload: unknown;
  timestamp: string;
}

// Team paths
function getTeamPath(teamName: string, cwd: string = process.cwd()): string {
  return join(cwd, '.omk', 'state', 'team', teamName);
}

function ensureTeamDir(teamName: string, cwd: string = process.cwd()): void {
  const teamPath = getTeamPath(teamName, cwd);
  if (!existsSync(teamPath)) {
    mkdirSync(teamPath, { recursive: true });
    mkdirSync(join(teamPath, 'workers'), { recursive: true });
    mkdirSync(join(teamPath, 'mailbox'), { recursive: true });
    mkdirSync(join(teamPath, 'tasks'), { recursive: true });
  }
}

// Tmux utilities
export function isTmuxAvailable(): boolean {
  try {
    execSync('tmux -V', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

export function getCurrentWindow(): string {
  try {
    return execSync('tmux display-message -p "#I"', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export function splitWindow(vertical: boolean = true): string | null {
  try {
    const direction = vertical ? '-v' : '-h';
    const output = execSync(`tmux split-window ${direction} -P -F "#P"`, { encoding: 'utf-8' });
    return output.trim();
  } catch {
    return null;
  }
}

export function sendKeys(paneId: string, keys: string): boolean {
  try {
    execSync(`tmux send-keys -t ${paneId} "${keys}" C-m`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function capturePane(paneId: string, lines: number = 50): string {
  try {
    return execSync(`tmux capture-pane -t ${paneId} -p -S -${lines}`, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

export function killPane(paneId: string): boolean {
  try {
    execSync(`tmux kill-pane -t ${paneId}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function listPanes(): { id: string; command: string }[] {
  try {
    const output = execSync('tmux list-panes -F "#{pane_id}\t#{pane_current_command}"', { encoding: 'utf-8' });
    return output.trim().split('\n').map(line => {
      const [id, command] = line.split('\t');
      return { id, command };
    });
  } catch {
    return [];
  }
}

// Team operations
export async function createTeam(
  name: string,
  workerCount: number,
  agentType: string,
  task: string,
  cwd: string = process.cwd()
): Promise<TeamState> {
  if (!isTmuxAvailable()) {
    throw new Error('tmux is required for team mode. Install with: brew install tmux (macOS) or apt install tmux (Linux)');
  }

  if (!isInTmux()) {
    throw new Error('Team mode must be run inside a tmux session. Start tmux first: tmux new -s omk');
  }

  ensureTeamDir(name, cwd);

  const config: TeamConfig = {
    name,
    workerCount,
    agentType,
    task,
    createdAt: new Date().toISOString(),
    status: 'creating',
  };

  const state: TeamState = {
    teamName: name,
    config,
    workers: [],
    tasks: [],
    mailbox: { leader: [], workers: {} },
  };

  // Save initial state
  saveTeamState(state, cwd);

  // Write mode state
  writeModeState('team', {
    mode: 'team',
    active: true,
    current_phase: 'creating',
    started_at: config.createdAt,
    state: { teamName: name },
  }, cwd);

  return state;
}

export async function startWorkers(
  teamName: string,
  cwd: string = process.cwd()
): Promise<TeamState> {
  const state = loadTeamState(teamName, cwd);
  if (!state) {
    throw new Error(`Team not found: ${teamName}`);
  }

  const { config } = state;
  const workers: Worker[] = [];

  // Create worker panes
  for (let i = 0; i < config.workerCount; i++) {
    const workerId = `worker-${i + 1}`;
    
    // Split window for worker
    const paneId = splitWindow(i % 2 === 0);
    
    if (!paneId) {
      console.error(`Failed to create pane for ${workerId}`);
      continue;
    }

    const worker: Worker = {
      id: workerId,
      paneId,
      status: 'idle',
    };

    workers.push(worker);

    // Create worker inbox
    const inboxPath = join(getTeamPath(teamName, cwd), 'workers', workerId, 'inbox.md');
    mkdirSync(dirname(inboxPath), { recursive: true });
    
    const inboxContent = `# Worker: ${workerId}

## Task
${config.task}

## Instructions
You are ${workerId} in team "${teamName}".
Agent type: ${config.agentType}

Wait for assignments in this inbox.
Report results to mailbox/leader.json

## Status
Ready and waiting.
`;
    writeFileSync(inboxPath, inboxContent);

    // Launch worker session (simulated - in real implementation would launch OMK)
    // For now, just show instructions
    sendKeys(paneId, `echo "[OMK Worker ${workerId}] Ready"`);
  }

  state.workers = workers;
  state.config.status = 'running';
  
  saveTeamState(state, cwd);
  
  writeModeState('team', {
    mode: 'team',
    active: true,
    current_phase: 'running',
    state: { teamName },
  }, cwd);

  return state;
}

export async function assignTask(
  teamName: string,
  workerId: string,
  task: string,
  cwd: string = process.cwd()
): Promise<void> {
  const state = loadTeamState(teamName, cwd);
  if (!state) return;

  const worker = state.workers.find(w => w.id === workerId);
  if (!worker || !worker.paneId) return;

  // Update worker inbox
  const inboxPath = join(getTeamPath(teamName, cwd), 'workers', workerId, 'inbox.md');
  const content = readFileSync(inboxPath, 'utf-8');
  const updated = content + `\n\n## New Assignment\n${task}\n\n**Assigned:** ${new Date().toISOString()}\n`;
  writeFileSync(inboxPath, updated);

  // Notify worker
  sendKeys(worker.paneId, `echo "[OMK] New task assigned"`);

  // Update state
  worker.status = 'working';
  worker.task = task;
  saveTeamState(state, cwd);
}

export async function getTeamStatus(
  teamName: string,
  cwd: string = process.cwd()
): Promise<TeamState | null> {
  return loadTeamState(teamName, cwd);
}

export async function shutdownTeam(
  teamName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const state = loadTeamState(teamName, cwd);
  if (!state) return;

  // Kill worker panes
  for (const worker of state.workers) {
    if (worker.paneId) {
      killPane(worker.paneId);
    }
  }

  // Update state
  state.config.status = 'completed';
  saveTeamState(state, cwd);

  // Clear mode state
  clearModeState('team', cwd);

  console.log(`Team ${teamName} shut down.`);
}

export function listTeams(cwd: string = process.cwd()): string[] {
  const teamPath = join(cwd, '.omk', 'state', 'team');
  if (!existsSync(teamPath)) return [];

  return readdirSync(teamPath).filter(name => {
    const statePath = join(teamPath, name, 'state.json');
    return existsSync(statePath);
  });
}

// State persistence
function saveTeamState(state: TeamState, cwd: string): void {
  const statePath = join(getTeamPath(state.teamName, cwd), 'state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function loadTeamState(teamName: string, cwd: string): TeamState | null {
  const statePath = join(getTeamPath(teamName, cwd), 'state.json');
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as TeamState;
  } catch {
    return null;
  }
}

function dirname(path: string): string {
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join('/');
}
