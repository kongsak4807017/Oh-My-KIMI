/**
 * Activity Logger - Real-time activity display
 * Shows what the AI is doing step by step
 */

import { stdout } from 'process';

export interface Activity {
  id: string;
  type: 'action' | 'thinking' | 'reading' | 'writing' | 'command' | 'complete' | 'error';
  message: string;
  timestamp: Date;
  status: 'running' | 'completed' | 'failed';
  details?: string;
}

export class ActivityLogger {
  private activities: Activity[] = [];
  private currentLine: number = 0;
  private isActive: boolean = false;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;
  private spinnerInterval?: NodeJS.Timeout;

  start() {
    this.isActive = true;
    this.startSpinner();
  }

  stop() {
    this.isActive = false;
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
    }
    // Clear the spinner line
    this.clearLine();
  }

  private startSpinner() {
    this.spinnerInterval = setInterval(() => {
      if (!this.isActive) return;
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      this.renderLatest();
    }, 80);
  }

  addActivity(activity: Omit<Activity, 'id' | 'timestamp'>): Activity {
    const fullActivity: Activity = {
      ...activity,
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
    };
    
    this.activities.push(fullActivity);
    
    // Keep only last 20 activities
    if (this.activities.length > 20) {
      this.activities.shift();
    }
    
    // Render immediately
    this.renderActivity(fullActivity);
    
    return fullActivity;
  }

  updateActivity(id: string, updates: Partial<Activity>) {
    const activity = this.activities.find(a => a.id === id);
    if (activity) {
      Object.assign(activity, updates);
      this.renderLatest();
    }
  }

  private getIcon(type: Activity['type'], status: Activity['status']): string {
    if (status === 'running') {
      return this.spinnerFrames[this.spinnerIndex];
    }
    
    const icons: Record<Activity['type'], string> = {
      action: '⚡',
      thinking: '💭',
      reading: '📖',
      writing: '✏️',
      command: '⚙️',
      complete: '✅',
      error: '❌',
    };
    
    return icons[type] || '•';
  }

  private getColor(type: Activity['type'], status: Activity['status']): string {
    if (status === 'failed') return '\x1b[31m'; // red
    if (status === 'completed') return '\x1b[32m'; // green
    
    const colors: Record<Activity['type'], string> = {
      action: '\x1b[33m',    // yellow
      thinking: '\x1b[36m',  // cyan
      reading: '\x1b[34m',   // blue
      writing: '\x1b[35m',   // magenta
      command: '\x1b[90m',   // gray
      complete: '\x1b[32m',  // green
      error: '\x1b[31m',     // red
    };
    
    return colors[type] || '\x1b[0m';
  }

  private renderActivity(activity: Activity) {
    const icon = this.getIcon(activity.type, activity.status);
    const color = this.getColor(activity.type, activity.status);
    const reset = '\x1b[0m';
    
    // Format time
    const time = activity.timestamp.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Print activity line
    const line = `${color}[${time}] ${icon} ${activity.message}${reset}`;
    console.log(line);
    
    // If has details, print on next line
    if (activity.details) {
      console.log(`  ${color}→ ${activity.details}${reset}`);
    }
  }

  private renderLatest() {
    // Find running activities
    const runningActivities = this.activities.filter(a => a.status === 'running');
    
    if (runningActivities.length === 0) return;
    
    // Update spinner on current line
    const latest = runningActivities[runningActivities.length - 1];
    const icon = this.spinnerFrames[this.spinnerIndex];
    const color = this.getColor(latest.type, latest.status);
    const reset = '\x1b[0m';
    
    // Move cursor up and rewrite line
    this.clearLine();
    process.stdout.write(`\r${color}${icon} ${latest.message}${reset}`);
  }

  private clearLine() {
    process.stdout.write('\r\x1b[K');
  }

  showSummary() {
    const completed = this.activities.filter(a => a.status === 'completed').length;
    const failed = this.activities.filter(a => a.status === 'failed').length;
    const running = this.activities.filter(a => a.status === 'running').length;
    
    console.log('\n─'.repeat(50));
    console.log(`Activities: ${completed} completed, ${failed} failed, ${running} running`);
    console.log('─'.repeat(50));
  }

  clear() {
    this.activities = [];
  }
}

// Singleton instance
let logger: ActivityLogger | null = null;

export function getActivityLogger(): ActivityLogger {
  if (!logger) {
    logger = new ActivityLogger();
  }
  return logger;
}
