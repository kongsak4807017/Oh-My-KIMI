/**
 * Plan Engine - Strategic planning with implementation steps
 */

import { runModelPrompt, ModelRunOptions } from '../model-runner.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export class PlanEngine {
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
    console.log('  OMK Plan - Strategic Planning');
    console.log('=================================\n');

    const plan = await this.createPlan(task);
    console.log(plan);

    // Save plan
    const plansDir = join(this.cwd, '.omk', 'plans');
    if (!existsSync(plansDir)) mkdirSync(plansDir, { recursive: true });
    const planPath = join(plansDir, `plan-${Date.now()}.md`);
    writeFileSync(planPath, plan);

    console.log(`\n[OMK Plan] Saved to: ${planPath}\n`);
  }

  async createPlan(task: string): Promise<string> {
    const prompt = `You are a technical planner. Create a detailed, actionable implementation plan for this task:

"""${task}"""

Your plan must include:
1. Goal statement
2. Assumptions and constraints
3. Step-by-step implementation (numbered)
4. Files to create or modify
5. Verification steps
6. Risk mitigation

Format as markdown. Be specific and concrete.`;

    const result = await runModelPrompt(prompt, this.options);
    return result.stdout;
  }
}
