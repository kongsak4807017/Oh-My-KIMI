/**
 * Shared dashboard state between the REPL prompt and activity logger.
 */

import { ExecutionProfile, mapPhase, resolveExecutionProfile } from '../orchestration/phase-map.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface DashboardAgent {
  key: string;
  agent: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  phase: string;
  task: string;
  updatedAt: Date;
  currentStep: number;
  totalSteps: number;
}

export interface DashboardTimelineEntry {
  id: string;
  time: Date;
  agent: string;
  role: string;
  phase: string;
  message: string;
  status: 'running' | 'completed' | 'failed';
}

export interface DashboardSnapshot {
  currentAgent: string;
  currentRole: string;
  currentPhase: string;
  currentTask: string;
  agents: DashboardAgent[];
  latestEvent: string;
  timeline: DashboardTimelineEntry[];
}

export interface DashboardActivityInput {
  agent?: string;
  role?: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  phase?: string;
  task?: string;
  skillName?: string;
  taskType?: string;
}

export class DashboardState {
  private cwd = process.cwd();
  private currentAgent = 'idle';
  private currentRole = 'system';
  private currentPhase = 'waiting';
  private currentTask = 'Ready for input';
  private latestEvent = 'Idle';
  private agents = new Map<string, DashboardAgent>();
  private timeline: DashboardTimelineEntry[] = [];

  configure(cwd: string): void {
    this.cwd = cwd;
    this.load();
  }

  updateFromActivity(activity: DashboardActivityInput): void {
    this.latestEvent = activity.message;

    if (!activity.agent) {
      return;
    }

    const profile = resolveExecutionProfile({ skillName: activity.skillName, taskType: activity.taskType });
    const key = `${activity.agent}:${activity.role ?? 'unknown'}`;
    const phase = mapPhase({
      status: activity.status,
      message: activity.message,
      explicitPhase: activity.phase,
      profile,
    });
    const task = activity.task ?? activity.message;
    const currentStep = Math.max(1, profile.phases.indexOf(phase) + 1 || 1);
    const totalSteps = profile.phases.length;

    this.agents.set(key, {
      key,
      agent: activity.agent,
      role: activity.role ?? 'unknown',
      status: this.toAgentStatus(activity.status),
      phase,
      task,
      updatedAt: new Date(),
      currentStep,
      totalSteps,
    });

    this.timeline.push({
      id: `${Date.now()}-${Math.random()}`,
      time: new Date(),
      agent: activity.agent,
      role: activity.role ?? 'unknown',
      phase,
      message: activity.message,
      status: activity.status,
    });
    if (this.timeline.length > 12) {
      this.timeline.shift();
    }

    this.currentAgent = activity.agent;
    this.currentRole = activity.role ?? 'unknown';
    this.currentPhase = phase;
    this.currentTask = task;
    this.persist();
  }

  getSnapshot(): DashboardSnapshot {
    const agents = Array.from(this.agents.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 4);

    return {
      currentAgent: this.currentAgent,
      currentRole: this.currentRole,
      currentPhase: this.currentPhase,
      currentTask: this.currentTask,
      agents,
      latestEvent: this.latestEvent,
      timeline: [...this.timeline].reverse().slice(0, 5),
    };
  }

  getRenderLines(width: number, spinnerFrame?: string): string[] {
    const snapshot = this.getSnapshot();
    const innerWidth = Math.max(50, Math.min(width - 4, 110));
    const separator = '-'.repeat(innerWidth);
    const header = this.pad('OMK HUD', innerWidth);
    const lines = [
      `+${separator}+`,
      `|${header}|`,
      `|${this.pad(`Agent : ${snapshot.currentAgent} [${snapshot.currentRole}]`, innerWidth)}|`,
      `|${this.pad(`Phase : ${snapshot.currentPhase}`, innerWidth)}|`,
      `|${this.pad(`Task  : ${snapshot.currentTask}`, innerWidth)}|`,
      `|${this.pad('Active Agents', innerWidth)}|`,
    ];

    if (snapshot.agents.length === 0) {
      lines.push(`|${this.pad('  - idle', innerWidth)}|`);
    } else {
      for (const agent of snapshot.agents) {
        const status = agent.status.padEnd(9);
        const content = `  - ${agent.agent}/${agent.role} ${status} ${agent.phase} (${agent.currentStep}/${agent.totalSteps})`;
        lines.push(`|${this.pad(content, innerWidth)}|`);
      }
    }

    lines.push(`|${this.pad('Timeline', innerWidth)}|`);
    if (snapshot.timeline.length === 0) {
      lines.push(`|${this.pad('  - no events yet', innerWidth)}|`);
    } else {
      for (const item of snapshot.timeline) {
        const time = item.time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        lines.push(`|${this.pad(`  ${time} ${item.agent}/${item.phase} ${item.message}`, innerWidth)}|`);
      }
    }

    while (lines.length < 14) {
      lines.push(`|${this.pad('', innerWidth)}|`);
    }

    const eventPrefix = spinnerFrame ? `[${spinnerFrame}] ` : '';
    lines.push(`|${this.pad(`Event : ${eventPrefix}${snapshot.latestEvent}`, innerWidth)}|`);
    lines.push(`+${separator}+`);
    return lines;
  }

  private toAgentStatus(status: DashboardActivityInput['status']): DashboardAgent['status'] {
    if (status === 'running') return 'running';
    if (status === 'failed') return 'failed';
    return 'completed';
  }

  clear(): void {
    this.currentAgent = 'idle';
    this.currentRole = 'system';
    this.currentPhase = 'waiting';
    this.currentTask = 'Ready for input';
    this.latestEvent = 'Idle';
    this.agents.clear();
    this.timeline = [];
    this.persist();
  }

  private getStateDir(): string {
    const localRoot = join(this.cwd, '.omk');
    if (existsSync(localRoot)) {
      const localState = join(localRoot, 'state');
      if (!existsSync(localState)) mkdirSync(localState, { recursive: true });
      return localState;
    }

    const globalState = join(homedir(), '.omk', 'state');
    if (!existsSync(globalState)) mkdirSync(globalState, { recursive: true });
    return globalState;
  }

  private getStateFile(): string {
    return join(this.getStateDir(), 'dashboard-state.json');
  }

  private load(): void {
    const file = this.getStateFile();
    if (!existsSync(file)) return;

    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        currentAgent: string;
        currentRole: string;
        currentPhase: string;
        currentTask: string;
        latestEvent: string;
        agents: Array<Omit<DashboardAgent, 'updatedAt'> & { updatedAt: string }>;
        timeline: Array<Omit<DashboardTimelineEntry, 'time'> & { time: string }>;
      };

      this.currentAgent = parsed.currentAgent;
      this.currentRole = parsed.currentRole;
      this.currentPhase = parsed.currentPhase;
      this.currentTask = parsed.currentTask;
      this.latestEvent = parsed.latestEvent;
      this.agents = new Map(
        parsed.agents.map(agent => [agent.key, { ...agent, updatedAt: new Date(agent.updatedAt) }]),
      );
      this.timeline = parsed.timeline.map(item => ({ ...item, time: new Date(item.time) }));
    } catch {
      // ignore malformed state
    }
  }

  private persist(): void {
    const file = this.getStateFile();
    const payload = {
      currentAgent: this.currentAgent,
      currentRole: this.currentRole,
      currentPhase: this.currentPhase,
      currentTask: this.currentTask,
      latestEvent: this.latestEvent,
      agents: Array.from(this.agents.values()),
      timeline: this.timeline,
    };
    writeFileSync(file, JSON.stringify(payload, null, 2));
  }

  private pad(text: string, width: number): string {
    const clipped = text.length > width ? `${text.slice(0, Math.max(0, width - 3))}...` : text;
    return clipped.padEnd(width, ' ');
  }
}

let dashboardState: DashboardState | null = null;

export function getDashboardState(): DashboardState {
  if (!dashboardState) {
    dashboardState = new DashboardState();
  }
  return dashboardState;
}
