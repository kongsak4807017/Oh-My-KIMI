/**
 * Team Engine - coordinated provider-backed lane orchestration.
 */

import { ModelRunOptions } from '../model-runner.js';
import { runLaneOrchestrator } from '../lane-orchestrator.js';

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
    const result = await runLaneOrchestrator({
      cwd: this.cwd,
      task,
      laneCount: workerCount,
      mode: 'team',
      runnerOptions: this.options,
      laneMaxIterations: 5,
    });

    const totalToolCalls = result.laneResults.reduce((sum, lane) => sum + lane.toolCalls, 0);
    const failed = result.laneResults.filter(lane => !lane.success);

    console.log('\n[OMK Team] Orchestration complete');
    console.log(`  lanes: ${result.laneResults.length}`);
    console.log(`  failed lanes: ${failed.length}`);
    console.log(`  lane tool calls: ${totalToolCalls}`);
    console.log(`  integration tool calls: ${result.integration.toolCalls ?? 0}`);
    console.log(`  verification tool calls: ${result.verification.toolCalls ?? 0}\n`);
  }
}
