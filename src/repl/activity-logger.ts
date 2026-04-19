/**
 * Activity Logger for the REPL.
 *
 * Default mode is intentionally non-intrusive: it never rewinds the cursor or
 * redraws a boxed HUD over the input area. Set OMK_HUD=full to restore the
 * old dashboard renderer for debugging.
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
  private readonly fullHud = process.env.OMK_HUD === 'full';
  private lastCompactLine = '';

  configure(cwd: string): void {
    this.dashboard.configure(cwd);
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    if (this.fullHud) {
      this.startSpinner();
    }
  }

  stop(): void {
    this.isActive = false;
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
    if (this.fullHud) {
      this.renderFullHud();
    }
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
    this.render(fullActivity);
    return fullActivity;
  }

  updateActivity(id: string, updates: Partial<Activity>): void {
    const activity = this.activities.find(item => item.id === id);
    if (!activity) return;

    Object.assign(activity, updates);
    this.dashboard.updateFromActivity(activity);
    this.render(activity);
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
    this.lastCompactLine = '';
  }

  private startSpinner(): void {
    this.spinnerInterval = setInterval(() => {
      if (!this.isActive) return;
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      this.renderFullHud();
    }, 200);
  }

  private isRendering = false;

  private render(activity: Activity): void {
    if (this.fullHud) {
      this.renderFullHud();
      return;
    }

    this.renderCompact(activity);
  }

  private renderCompact(activity: Activity): void {
    if (!stdout.isTTY) return;

    if (activity.status === 'completed' && activity.type !== 'complete' && activity.type !== 'tool_result') {
      return;
    }

    if (activity.message.startsWith('Streaming progress:')) {
      return;
    }

    const label = activity.status === 'running'
      ? 'running'
      : activity.status === 'failed'
        ? 'error'
        : activity.type === 'complete'
          ? 'done'
          : activity.type === 'tool_result'
            ? 'tool'
            : 'info';

    const actor = activity.agent
      ? `${activity.agent}${activity.role ? `/${activity.role}` : ''}`
      : activity.role ?? 'omk';
    const detail = activity.details ? ` - ${this.clean(activity.details, 80)}` : '';
    const line = `[${label}] ${actor}: ${this.clean(activity.message, 90)}${detail}`;

    if (line === this.lastCompactLine) return;
    this.lastCompactLine = line;

    stdout.write(`\x1b[90m${line}\x1b[0m\n`);
  }

  private clean(text: string, maxLength: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 3))}...` : clean;
  }

  private renderFullHud(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    try {
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
    } finally {
      this.isRendering = false;
    }
  }

  private injectEventDetail(eventLine: string, detail: string, width: number): string {
    const clean = detail.replace(/\s+/g, ' ').trim();
    const maxWidth = Math.max(20, Math.min(width - 18, 60));
    const clipped = clean.length > maxWidth ? `${clean.slice(0, maxWidth - 3)}...` : clean;
    return eventLine.replace(/\|\s*$/, ` | ${clipped} |`).slice(0, width);
  }

  private rewind(): void {
    if (this.renderedLines <= 0) return;

    // Move cursor up to the first line of the previously rendered block
    stdout.write(`\x1b[${this.renderedLines}A`);
    // Clear each line from the saved position
    for (let i = 0; i < this.renderedLines; i++) {
      stdout.write('\x1b[2K');
      if (i < this.renderedLines - 1) {
        stdout.write('\x1b[1B');
      }
    }
    // Return to the beginning of the first cleared line
    stdout.write('\r');
  }
}

let logger: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!logger) {
    logger = new ActivityLogger();
  }
  return logger;
}
