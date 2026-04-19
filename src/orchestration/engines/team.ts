/**
 * Team Engine - Coordinated multi-agent execution via tmux
 */

import { runModelPrompt, runModelToolLoop, ModelRunOptions } from '../model-runner.js';
import {
  createTeam,
  startWorkers,
  assignTask,
  shutdownTeam,
  getTeamStatus,
  isTmuxAvailable,
  isInTmux,
  capturePane,
  Worker,
} from '../../team/index.js';

export class TeamEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(task: string, workerCount: number = 3): Promise<void> {
    if (!isTmuxAvailable()) {
      console.log('tmux is not available. Running team lanes in-process instead.');
      await this.runInProcess(task, workerCount);
      return;
    }
    if (!isInTmux()) {
      console.log('Not inside tmux. Running team lanes in-process instead.');
      await this.runInProcess(task, workerCount);
      return;
    }

    const teamName = `team-${Date.now()}`;
    console.log(`\n[OMK Team] Creating team: ${teamName} with ${workerCount} workers\n`);

    const state = await createTeam(teamName, workerCount, 'generalist', task, this.cwd);
    await startWorkers(teamName, this.cwd);

    // Break task into subtasks via the configured provider.
    console.log('[OMK Team] Decomposing task into subtasks...\n');
    const planResult = await runModelPrompt(
      `Break this task into ${workerCount} independent subtasks:\n\n${task}\n\nReturn as numbered list.`,
      this.options
    );

    const subtasks = this.parseSubtasks(planResult.stdout);

    // Assign to workers
    for (let i = 0; i < Math.min(subtasks.length, state.workers.length); i++) {
      const worker = state.workers[i];
      const subtask = subtasks[i];
      console.log(`[OMK Team] Assigning to ${worker.id}: ${subtask.slice(0, 80)}...`);
      await assignTask(teamName, worker.id, subtask, this.cwd);
    }

    // Poll for completion
    console.log('\n[OMK Team] Waiting for workers to complete...\n');
    await this.pollUntilDone(teamName, state.workers, 30);

    // Collect results from panes
    const results = state.workers.map((w) => ({
      worker: w.id,
      output: w.paneId ? capturePane(w.paneId, 30) : '',
    }));

    // Consolidate via the configured provider.
    console.log('\n[OMK Team] Consolidating results...\n');
    const consolidatePrompt = `Consolidate these worker outputs into a coherent final result:\n\n${results
      .map((r) => `## ${r.worker}\n${r.output}`)
      .join('\n\n')}`;

    await runModelPrompt(consolidatePrompt, this.options);

    await shutdownTeam(teamName, this.cwd);
    console.log('\n[OMK Team] Done.\n');
  }

  private async runInProcess(task: string, workerCount: number): Promise<void> {
    console.log(`\n[OMK Team] In-process team: ${workerCount} lanes\n`);
    const planResult = await runModelPrompt(
      `Break this task into ${workerCount} independent subtasks:\n\n${task}\n\nReturn as numbered list.`,
      this.options
    );
    const subtasks = this.parseSubtasks(planResult.stdout).slice(0, workerCount);
    const results: { worker: string; output: string }[] = [];

    for (let i = 0; i < Math.max(subtasks.length, 1); i++) {
      const subtask = subtasks[i] ?? task;
      console.log(`\n[OMK Team] Lane ${i + 1}: ${subtask}\n`);
      const result = await runModelToolLoop(
        `You are team worker ${i + 1}. Complete this bounded lane and report concise results.\n\n${subtask}`,
        this.cwd,
        this.options
      );
      results.push({ worker: `lane-${i + 1}`, output: result.stdout });
    }

    await runModelPrompt(
      `Consolidate these team lane outputs into one final result:\n\n${results
        .map((r) => `## ${r.worker}\n${r.output}`)
        .join('\n\n')}`,
      this.options
    );
  }

  private parseSubtasks(text: string): string[] {
    const lines = text.split('\n');
    const tasks: string[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*(?:\d+[.):-]\s+|-\s+)(.*)$/);
      if (match && match[1].trim()) {
        tasks.push(match[1].trim());
      }
    }
    return tasks.length > 0 ? tasks : [text];
  }

  private async pollUntilDone(teamName: string, workers: Worker[], maxMinutes: number): Promise<void> {
    const deadline = Date.now() + maxMinutes * 60 * 1000;
    while (Date.now() < deadline) {
      const state = await getTeamStatus(teamName, this.cwd);
      if (!state) break;
      const allDone = state.workers.every(
        (w) => w.status === 'completed' || w.status === 'error'
      );
      if (allDone) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
