/**
 * Swarm Engine - Parallel exploration with voting/consensus
 */

import { runModelPrompt, ModelRunOptions } from '../model-runner.js';
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

export class SwarmEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(task: string, agentCount: number = 3, voteMethod: string = 'ranking'): Promise<void> {
    if (!isTmuxAvailable() || !isInTmux()) {
      console.log('[OMK Swarm] tmux unavailable. Running simulated swarm in-process.\n');
      await this.runSimulated(task, agentCount, voteMethod);
      return;
    }

    const teamName = `swarm-${Date.now()}`;
    console.log(`\n[OMK Swarm] Spawning ${agentCount} agents for: ${task}\n`);

    await createTeam(teamName, agentCount, 'explorer', task, this.cwd);
    const state = await startWorkers(teamName, this.cwd);

    // Each worker gets a slightly different angle
    const angles = await this.generateAngles(task, state.workers.length);
    for (let i = 0; i < state.workers.length; i++) {
      const prompt = `Explore this problem from this angle: ${angles[i] || 'General exploration'}\n\nProblem: ${task}\n\nProvide your best solution and reasoning.`;
      await assignTask(teamName, state.workers[i].id, prompt, this.cwd);
    }

    console.log('[OMK Swarm] Waiting for explorations...\n');
    await this.poll(teamName, 15);

    const explorations = state.workers.map((w) => ({
      agent: w.id,
      output: w.paneId ? capturePane(w.paneId, 30) : '',
    }));

    console.log('\n[OMK Swarm] Voting and consolidating...\n');
    await this.runVote(task, explorations, voteMethod);

    await shutdownTeam(teamName, this.cwd);
  }

  private async runSimulated(task: string, agentCount: number, voteMethod: string): Promise<void> {
    const explorations = [];
    for (let i = 0; i < agentCount; i++) {
      const angle = await runModelPrompt(
        `Generate a unique exploration angle for: ${task}\nRespond with one sentence describing the angle.`,
        this.options
      );
      const res = await runModelPrompt(
        `Explore this problem from the angle: ${angle.stdout}\n\n${task}\n\nProvide your best solution.`,
        this.options
      );
      explorations.push({ agent: `agent-${i + 1}`, output: res.stdout });
    }
    await this.runVote(task, explorations, voteMethod);
  }

  private async generateAngles(task: string, count: number): Promise<string[]> {
    const res = await runModelPrompt(
      `Generate ${count} different angles to explore this problem. Return as numbered list:\n\n${task}`,
      this.options
    );
    return res.stdout
      .split('\n')
      .map((l) => l.match(/^\s*(?:\d+[.):-]\s+|-\s+)(.*)$/)?.[1])
      .filter(Boolean) as string[];
  }

  private async runVote(
    task: string,
    explorations: { agent: string; output: string }[],
    voteMethod: string
  ): Promise<void> {
    const votePrompt = `You are the Swarm Leader. Review these ${explorations.length} agent explorations and produce a consensus result.

Task: ${task}
Vote method: ${voteMethod}

${explorations.map((e) => `## ${e.agent}\n${e.output}`).join('\n\n')}

Provide:
1. Best option (with reasoning)
2. Confidence score (1-10)
3. Any dissenting views worth noting`;

    const result = await runModelPrompt(votePrompt, this.options);
    console.log(result.stdout);
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
