/**
 * OMK Orchestration Layer
 * High-level engines that control Kimi CLI execution
 */

export { RalphEngine } from './engines/ralph.js';
export { TeamEngine } from './engines/team.js';
export { UltraworkEngine } from './engines/ultrawork.js';
export { SwarmEngine } from './engines/swarm.js';
export { UltraQAEngine } from './engines/ultraqa.js';
export { PipelineEngine } from './engines/pipeline.js';
export { AutopilotEngine } from './engines/autopilot.js';
export { PlanEngine } from './engines/plan.js';
export { DeepInterviewEngine } from './engines/deep-interview.js';

export { runKimiPrompt, runKimiShell } from './passthrough-runner.js';
export { parseActions } from './action-parser.js';
export { executeAction, executeActions, formatResultsForPrompt } from './action-executor.js';

import { RalphEngine } from './engines/ralph.js';
import { TeamEngine } from './engines/team.js';
import { UltraworkEngine } from './engines/ultrawork.js';
import { SwarmEngine } from './engines/swarm.js';
import { UltraQAEngine } from './engines/ultraqa.js';
import { PipelineEngine } from './engines/pipeline.js';
import { AutopilotEngine } from './engines/autopilot.js';
import { PlanEngine } from './engines/plan.js';
import { DeepInterviewEngine } from './engines/deep-interview.js';

export interface EngineOptions {
  provider?: any;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  yolo?: boolean;
  thinking?: boolean;
  reasoning?: string;
}

/**
 * Route a skill invocation to the appropriate engine
 */
export async function runEngine(
  skillName: string,
  args: string[],
  cwd: string,
  options: EngineOptions = {}
): Promise<void> {
  const userInput = args.join(' ').trim();

  switch (skillName) {
    case 'ralph': {
      const engine = new RalphEngine(cwd, userInput || 'Complete the current task', options);
      await engine.run();
      break;
    }

    case 'team': {
      const engine = new TeamEngine(cwd, options);
      await engine.run(userInput || 'Coordinate team execution');
      break;
    }

    case 'ultrawork': {
      const engine = new UltraworkEngine(cwd, options);
      await engine.run(userInput || 'Process batch tasks');
      break;
    }

    case 'swarm': {
      const engine = new SwarmEngine(cwd, options);
      await engine.run(userInput || 'Explore options');
      break;
    }

    case 'ultraqa': {
      const engine = new UltraQAEngine(cwd, options);
      await engine.run(userInput || undefined);
      break;
    }

    case 'pipeline': {
      const engine = new PipelineEngine(cwd, options);
      await engine.run(userInput || 'build');
      break;
    }

    case 'autopilot': {
      const engine = new AutopilotEngine(cwd, options);
      await engine.run(userInput || 'Run full delivery workflow');
      break;
    }

    case 'plan':
    case 'ralplan': {
      const engine = new PlanEngine(cwd, options);
      await engine.run(userInput || 'Create implementation plan');
      break;
    }

    case 'deep-interview': {
      const engine = new DeepInterviewEngine(cwd, options);
      await engine.run(userInput || undefined);
      break;
    }

    default: {
      throw new Error(`No engine available for skill: ${skillName}`);
    }
  }
}
