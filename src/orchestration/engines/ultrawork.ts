/**
 * Ultrawork Engine - high-throughput provider-backed lane orchestration.
 */

import { ModelRunOptions } from '../model-runner.js';
import { runLaneOrchestrator } from '../lane-orchestrator.js';

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
    const result = await runLaneOrchestrator({
      cwd: this.cwd,
      task,
      laneCount: workerCount,
      mode: 'ultrawork',
      runnerOptions: this.options,
      laneMaxIterations: 4,
    });

    const totalToolCalls = result.laneResults.reduce((sum, lane) => sum + lane.toolCalls, 0);
    const failed = result.laneResults.filter(lane => !lane.success);

    console.log('\n[OMK Ultrawork] Orchestration complete');
    console.log(`  lanes: ${result.laneResults.length}`);
    console.log(`  failed lanes: ${failed.length}`);
    console.log(`  lane tool calls: ${totalToolCalls}`);
    console.log(`  integration tool calls: ${result.integration.toolCalls ?? 0}`);
    console.log(`  verification tool calls: ${result.verification.toolCalls ?? 0}\n`);
  }
}
