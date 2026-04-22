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
  phase?: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface Activity {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'agent';
  message: string;
  status: 'running' | 'waiting' | 'completed' | 'error' | 'info';
  timestamp: Date;
  agentName?: string;
  role?: string;
  phase?: string;
}

export interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  context: number;
  total: number;
  limit: number;
  routes: string[];
}
