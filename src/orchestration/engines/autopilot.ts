/**
 * Autopilot Engine - Full autonomous pipeline
 * Meta-engine that runs Plan -> Execute -> Verify
 */

import { PlanEngine } from './plan.js';
import { RalphEngine } from './ralph.js';
import { UltraQAEngine } from './ultraqa.js';
import { ModelRunOptions } from '../model-runner.js';

export class AutopilotEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(task: string): Promise<void> {
    console.log('\n=================================');
    console.log('  OMK Autopilot - Full Pipeline');
    console.log('=================================\n');

    // Phase 1: Plan
    console.log('[OMK Autopilot] Phase 1: Planning\n');
    const planner = new PlanEngine(this.cwd, this.options);
    const plan = await planner.createPlan(task);
    console.log('\nPlan created.\n');

    // Phase 2: Execute with Ralph
    console.log('[OMK Autopilot] Phase 2: Execution (Ralph)\n');
    const executePrompt = `Execute this plan step by step. Do not stop until all tasks are complete and verified.\n\n${plan}`;
    const ralph = new RalphEngine(this.cwd, executePrompt, this.options);
    await ralph.run();

    // Phase 3: Verify with UltraQA
    console.log('[OMK Autopilot] Phase 3: Verification (UltraQA)\n');
    const qa = new UltraQAEngine(this.cwd, this.options);
    await qa.run();

    console.log('\n[OMK Autopilot] Pipeline complete.\n');
  }
}
