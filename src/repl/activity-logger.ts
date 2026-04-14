/**
 * Activity Logger - REPL activity HUD inspired by OMX.
 * Shows which agent/lane is active and what it is doing.
 */

import { stdout } from 'process';
import { getDashboardState } from './dashboard-state.js';

export interface Activity {
  id: string;
  type: 'action' | 'thinking' | 'reading' | 'writing' | 'command' | 'complete' | 'error' | 'tool_call' | 'tool_result';
  message: string;
  timestamp: Date;
  status: 'running' | 'completed' | 'failed';
  details?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  agent?: string;
  role?: string;
  phase?: string;
  task?: string;
  skillName?: string;
  taskType?: string;
}

export class ActivityLogger {
  private activities: Activity[] = [];
  private isActive = false;
  private spinnerFrames = ['-', '\\', '|', '/'];
  private spinnerIndex = 0;
  private spinnerInterval?: NodeJS.Timeout;
  private renderedLines = 0;
  private dashboard = getDashboardState();

  configure(cwd: string): void {
    this.dashboard.configure(cwd);
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.startSpinner();
  }

  stop(): void {
    this.isActive = false;
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
    this.render();
  }

  addActivity(activity: Omit<Activity, 'id' | 'timestamp'>): Activity {
    const fullActivity: Activity = {
      ...activity,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };

    this.activities.push(fullActivity);
    if (this.activities.length > 30) {
      this.activities.shift();
    }

    this.dashboard.updateFromActivity(fullActivity);
    this.render();
    return fullActivity;
  }

  updateActivity(id: string, updates: Partial<Activity>): void {
    const activity = this.activities.find(item => item.id === id);
    if (!activity) return;

    Object.assign(activity, updates);
    this.dashboard.updateFromActivity(activity);
    this.render();
  }

  showSummary(): void {
    const completed = this.activities.filter(a => a.status === 'completed').length;
    const failed = this.activities.filter(a => a.status === 'failed').length;
    const running = this.activities.filter(a => a.status === 'running').length;

    console.log('\n' + '-'.repeat(60));
    console.log(`Activities: ${completed} completed, ${failed} failed, ${running} running`);
    console.log('-'.repeat(60));
  }

  clear(): void {
    this.activities = [];
    this.dashboard.clear();
    this.stop();
  }

  private startSpinner(): void {
    this.spinnerInterval = setInterval(() => {
      if (!this.isActive) return;
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      this.render();
    }, 100);
  }

  private render(): void {
    const running = this.activities.filter(activity => activity.status === 'running');
    const latestRunning = running.length > 0 ? running[running.length - 1] : undefined;
    const spinner = this.isActive && latestRunning ? this.spinnerFrames[this.spinnerIndex] : undefined;
    const lines = this.dashboard.getRenderLines(stdout.columns || 100, spinner);

    if (latestRunning?.details) {
      lines[lines.length - 2] = this.injectEventDetail(lines[lines.length - 2], latestRunning.details, stdout.columns || 100);
    }

    this.rewind();
    stdout.write(lines.join('\n') + '\n');
    this.renderedLines = lines.length;
  }

  private injectEventDetail(eventLine: string, detail: string, width: number): string {
    const clean = detail.replace(/\s+/g, ' ').trim();
    const maxWidth = Math.max(20, Math.min(width - 18, 60));
    const clipped = clean.length > maxWidth ? `${clean.slice(0, maxWidth - 3)}...` : clean;
    return eventLine.replace(/\|\s*$/, ` | ${clipped} |`).slice(0, width);
  }

  private rewind(): void {
    if (this.renderedLines <= 0) return;

    for (let index = 0; index < this.renderedLines; index++) {
      stdout.write('\x1b[1A\r\x1b[2K');
    }
  }
}

let logger: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!logger) {
    logger = new ActivityLogger();
  }
  return logger;
}
