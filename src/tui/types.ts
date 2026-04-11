/**
 * TUI Types
 */

export interface Agent {
  id: string;
  name: string;
  role: 'explorer' | 'planner' | 'executor' | 'reviewer' | 'debugger' | string;
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'error';
  task?: string;
  progress?: number;
}

export interface Activity {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'agent';
  message: string;
  status: 'running' | 'waiting' | 'completed' | 'error' | 'info';
  timestamp: Date;
  agentName?: string;
}

export interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
}
