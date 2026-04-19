/**
 * Ralph Engine - Persistence loop until task completion with verification
 * Runs on top of the configured provider with structured tool execution.
 */

import { runModelPrompt, runModelToolLoop, ModelRunOptions } from '../model-runner.js';
import {
  writeModeState,
  clearModeState,
  createTask,
  updateTask,
  listTasks,
} from '../../state/index.js';
import { execSync } from 'child_process';

export interface RalphState {
  iteration: number;
  maxIterations: number;
  task: string;
  history: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }[];
  completed: boolean;
  verified: boolean;
  pendingActions: string[];
}

export class RalphEngine {
  private cwd: string;
  private state: RalphState;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    task: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
    this.state = {
      iteration: 0,
      maxIterations: 10,
      task,
      history: [],
      completed: false,
      verified: false,
      pendingActions: [],
    };
  }

  async run(): Promise<void> {
    this.logLaunch();
    this.writeState('running');

    createTask({
      title: `Ralph: ${this.state.task}`,
      description: this.state.task,
      status: 'in_progress',
    }, this.cwd);

    while (this.state.iteration < this.state.maxIterations) {
      this.state.iteration++;
      console.log(`\n\n[OMK Ralph] Iteration ${this.state.iteration}/${this.state.maxIterations}\n`);

      const prompt = this.buildPrompt();
      const result = await runModelToolLoop(prompt, this.cwd, this.options, { maxIterations: 4 });

      this.state.history.push({ role: 'assistant', content: result.stdout });

      // Check completion via explicit markers or ask the provider.
      const isComplete = this.detectCompletion(result.stdout);
      if (isComplete) {
        this.state.completed = true;
        break;
      }

      // If there is no completion marker, ask the provider explicitly.
      if (!isComplete) {
        const checkPrompt = this.buildCheckPrompt();
        const checkResult = await runModelPrompt(checkPrompt, this.options);
        if (this.detectCompletion(checkResult.stdout)) {
          this.state.completed = true;
          break;
        }
      }
    }

    if (!this.state.completed) {
      console.log('\n[OMK Ralph] Max iterations reached without confirmed completion.\n');
      this.writeState('failed');
      return;
    }

    // Architect verification
    console.log('\n[OMK Ralph] Running architect verification...\n');
    const verified = await this.architectVerify();

    if (verified) {
      console.log('\n[OMK Ralph] Task complete and verified. Cleaning up...\n');
      this.writeState('completed');
      clearModeState('ralph', this.cwd);
    } else {
      console.log('\n[OMK Ralph] Verification failed. Consider re-running with more specific instructions.\n');
      this.writeState('failed');
    }
  }

  private logLaunch(): void {
    console.log('\n=================================');
    console.log('  OMK Ralph - Persistence Loop');
    console.log('=================================');
    console.log(`Task: ${this.state.task}\n`);
    if (this.options.yolo) {
      console.log('[YOLO] Bypassing confirmations\n');
    }
  }

  private buildPrompt(): string {
    const systemPrompt = `You are Ralph, a persistent autonomous coding agent.
Your goal: complete the user's task fully, verify your work, and stop only when done.

RULES:
1. Work step by step. Use tools when needed.
2. After each step, report what you did and what remains.
3. If you need to read, write, run commands, or search code, emit the tool call on its own line like:
   $read_file path="src/index.ts"
   $execute_command command="npm test"
   $write_file path="src/new.ts" content="..."
4. Do not say you will do something — DO it by emitting the tool call.
5. When the task is truly complete, say "RALPH_COMPLETE" in your response.
6. If tests fail, fix them. If build fails, fix it. Keep going.

Current task: ${this.state.task}`;

    const historyPrompt = this.state.history
      .map((h) => `--- ${h.role.toUpperCase()} ---\n${h.content}`)
      .join('\n\n');

    if (historyPrompt) {
      return `${systemPrompt}\n\n## History\n${historyPrompt}\n\n--- USER ---\nContinue working. Check for pending tasks and execute the next step.`;
    }

    return `${systemPrompt}\n\n--- USER ---\nStart working on the task now.`;
  }

  private buildCheckPrompt(): string {
    const history = this.state.history
      .map((h) => `--- ${h.role.toUpperCase()} ---\n${h.content}`)
      .join('\n\n');

    return `You are Ralph checking task completion.
\nTask: ${this.state.task}\n\nHistory:\n${history}\n\nAre you completely done? If yes, say RALPH_COMPLETE. If not, list what remains and continue working.`;
  }

  private detectCompletion(output: string): boolean {
    const upper = output.toUpperCase();
    return (
      upper.includes('RALPH_COMPLETE') ||
      /all\s+tasks?\s+complete/i.test(output) ||
      /task\s+is\s+fully\s+complete/i.test(output)
    );
  }

  private async architectVerify(): Promise<boolean> {
    let diff = '';
    try {
      diff = execSync('git diff --stat', { cwd: this.cwd, encoding: 'utf-8' });
    } catch {
      // ignore if not a git repo
    }

    const pending = listTasks(this.cwd).filter((t) => t.status !== 'completed');

    const verifyPrompt = `You are the Architect. Review this work for correctness.

Task: ${this.state.task}

Git changes:\n${diff || 'No changes detected'}

Pending tasks: ${pending.length > 0 ? pending.map((t) => t.title).join(', ') : 'None'}

Respond with exactly one word at the top: APPROVED or REJECTED.
Then briefly explain why.`;

    const result = await runModelPrompt(verifyPrompt, this.options);
    return result.stdout.toUpperCase().includes('APPROVED');
  }

  private writeState(phase: string): void {
    writeModeState('ralph', {
      mode: 'ralph',
      active: phase !== 'completed' && phase !== 'failed',
      current_phase: phase,
      iteration: this.state.iteration,
      max_iterations: this.state.maxIterations,
      state: {
        task: this.state.task,
        completed: this.state.completed,
        verified: this.state.verified,
      },
    }, this.cwd);
  }
}
