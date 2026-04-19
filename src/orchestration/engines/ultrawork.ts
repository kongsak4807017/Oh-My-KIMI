/**
 * Ultrawork Engine - High-throughput parallel execution
 * Similar to Team but with more workers and less coordination overhead
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
} from '../../team/index.js';

export class UltraworkEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(task: string, workerCount: number = 5): Promise<void> {
    if (!isTmuxAvailable() || !isInTmux()) {
      // Fallback: run in-process batch
      console.log(`\n[OMK Ultrawork] tmux unavailable. Running in-process batch mode.\n`);
      await this.runInProcess(task);
      return;
    }

    const teamName = `ulw-${Date.now()}`;
    console.log(`\n[OMK Ultrawork] Spawning ${workerCount} workers for: ${task}\n`);

    await createTeam(teamName, workerCount, 'batch-worker', task, this.cwd);
    const state = await startWorkers(teamName, this.cwd);

    // Shard task
    const shards = await this.shardTask(task, state.workers.length);

    // Assign in parallel
    await Promise.all(
      state.workers.map((w, i) =>
        assignTask(teamName, w.id, shards[i] || 'Assist with remaining work', this.cwd)
      )
    );

    console.log('[OMK Ultrawork] All tasks dispatched. Waiting...\n');
    await this.poll(teamName, 20);

    const results = state.workers.map((w) => ({
      worker: w.id,
      output: w.paneId ? capturePane(w.paneId, 20) : '',
    }));

    console.log('\n[OMK Ultrawork] Aggregating results...\n');
    const aggregatePrompt = `Aggregate these parallel worker outputs. Summarize findings and next steps:\n\n${results
      .map((r) => `## ${r.worker}\n${r.output}`)
      .join('\n\n')}`;

    await runModelPrompt(aggregatePrompt, this.options);

    await shutdownTeam(teamName, this.cwd);
  }

  private async runInProcess(task: string): Promise<void> {
    // Break into batches and run sequentially through the configured provider.
    const plan = await runModelPrompt(
      `Split this task into 3-5 independent batches:\n\n${task}\n\nReturn as numbered list only.`,
      this.options
    );

    const batches = plan.stdout
      .split('\n')
      .map((l) => l.match(/^\s*(?:\d+[.):-]\s+|-\s+)(.*)$/)?.[1])
      .filter(Boolean) as string[];

    const outputs: string[] = [];
    for (let i = 0; i < batches.length; i++) {
      console.log(`\n[OMK Ultrawork] Batch ${i + 1}/${batches.length}: ${batches[i]}\n`);
      const res = await runModelToolLoop(batches[i], this.cwd, this.options, { maxIterations: 3 });
      outputs.push(res.stdout);
    }

    const final = await runModelPrompt(
      `Synthesize these batch outputs into a single coherent result:\n\n${outputs
        .map((o, i) => `## Batch ${i + 1}\n${o}`)
        .join('\n\n')}`,
      this.options
    );
    console.log(final.stdout);
  }

  private async shardTask(task: string, count: number): Promise<string[]> {
    const res = await runModelPrompt(
      `Split this task into exactly ${count} independent shards. Return as numbered list 1-${count}:\n\n${task}`,
      this.options
    );
    const shards = res.stdout
      .split('\n')
      .map((l) => l.match(/^\s*(?:\d+[.):-]\s+|-\s+)(.*)$/)?.[1])
      .filter(Boolean) as string[];
    return shards.length >= count ? shards.slice(0, count) : Array(count).fill(task);
  }

  private async poll(teamName: string, maxMinutes: number): Promise<void> {
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
