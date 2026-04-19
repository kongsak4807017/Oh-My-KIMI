/**
 * Pipeline Engine - Multi-stage pipeline execution
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface PipelineStage {
  name: string;
  command?: string;
  depends_on?: string[];
  parallel?: boolean;
  steps?: { name: string; command: string }[];
  condition?: string;
}

interface PipelineDef {
  stages: PipelineStage[];
}

export class PipelineEngine {
  private cwd: string;
  private options: { yolo?: boolean; thinking?: boolean; reasoning?: string };

  constructor(
    cwd: string,
    options: { yolo?: boolean; thinking?: boolean; reasoning?: string } = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(pipelineName: string): Promise<void> {
    const def = this.loadPipeline(pipelineName);
    if (!def) {
      console.error(`Pipeline not found: ${pipelineName}`);
      console.log('Built-in pipelines: test, build, release');
      return;
    }

    console.log(`\n[OMK Pipeline] Running: ${pipelineName}\n`);

    const order = this.topologicalSort(def.stages);
    const results: Record<string, boolean> = {};

    for (const stageName of order) {
      const stage = def.stages.find((s) => s.name === stageName)!;

      // Check condition
      if (stage.condition && !this.evaluateCondition(stage.condition)) {
        console.log(`[OMK Pipeline] Skipping ${stage.name} (condition: ${stage.condition})`);
        results[stage.name] = true;
        continue;
      }

      console.log(`\n[OMK Pipeline] Stage: ${stage.name}\n`);

      let success = false;
      if (stage.parallel && stage.steps) {
        const stepResults = await Promise.all(
          stage.steps.map((step) => this.runStep(step.name, step.command))
        );
        success = stepResults.every((r) => r);
      } else {
        success = await this.runStep(stage.name, stage.command);
      }

      results[stage.name] = success;

      if (!success) {
        console.error(`\n[OMK Pipeline] Stage ${stage.name} failed. Aborting.\n`);
        return;
      }
    }

    console.log('\n[OMK Pipeline] All stages completed successfully.\n');
  }

  private loadPipeline(name: string): PipelineDef | null {
    const customPath = join(this.cwd, '.omk', 'pipelines', `${name}.yml`);
    if (existsSync(customPath)) {
      // Very basic YAML-ish parser for simple pipeline files
      return this.parseYaml(readFileSync(customPath, 'utf-8'));
    }

    // Built-in pipelines
    const builtins: Record<string, PipelineDef> = {
      test: {
        stages: [
          { name: 'lint', command: 'npm run lint' },
          { name: 'test', command: 'npm test', depends_on: ['lint'] },
        ],
      },
      build: {
        stages: [
          { name: 'lint', command: 'npm run lint' },
          { name: 'test', command: 'npm test', depends_on: ['lint'] },
          { name: 'build', command: 'npm run build', depends_on: ['test'] },
        ],
      },
      release: {
        stages: [
          { name: 'test', command: 'npm test' },
          { name: 'build', command: 'npm run build', depends_on: ['test'] },
          { name: 'tag', command: 'git tag -a v$(node -p "require(\"./package.json\").version") -m "Release"', depends_on: ['build'] },
        ],
      },
    };

    return builtins[name] || null;
  }

  private parseYaml(yaml: string): PipelineDef {
    const lines = yaml.split('\n');
    const stages: PipelineStage[] = [];
    let currentStage: PipelineStage | null = null;
    let currentSteps: { name: string; command: string }[] = [];
    let inSteps = false;

    for (const line of lines) {
      const stageMatch = line.match(/^\s+-\s+name:\s*(.*)$/);
      if (stageMatch) {
        if (currentStage) {
          if (currentSteps.length > 0) {
            currentStage.steps = currentSteps;
          }
          stages.push(currentStage);
        }
        currentStage = { name: stageMatch[1].trim(), steps: [] };
        currentSteps = [];
        inSteps = false;
        continue;
      }

      if (!currentStage) continue;

      const commandMatch = line.match(/^\s+command:\s*(.*)$/);
      if (commandMatch) {
        currentStage.command = commandMatch[1].trim();
        continue;
      }

      const dependsMatch = line.match(/^\s+depends_on:\s*\[(.*)\]$/);
      if (dependsMatch) {
        currentStage.depends_on = dependsMatch[1].split(',').map((s) => s.trim());
        continue;
      }

      const parallelMatch = line.match(/^\s+parallel:\s*(true|false)$/);
      if (parallelMatch) {
        currentStage.parallel = parallelMatch[1] === 'true';
        continue;
      }

      const conditionMatch = line.match(/^\s+condition:\s*(.*)$/);
      if (conditionMatch) {
        currentStage.condition = conditionMatch[1].trim();
        continue;
      }
    }

    if (currentStage) {
      stages.push(currentStage);
    }

    return { stages };
  }

  private topologicalSort(stages: PipelineStage[]): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const stage of stages) {
      graph.set(stage.name, []);
      inDegree.set(stage.name, 0);
    }

    for (const stage of stages) {
      for (const dep of stage.depends_on || []) {
        graph.get(dep)?.push(stage.name);
        inDegree.set(stage.name, (inDegree.get(stage.name) || 0) + 1);
      }
    }

    const queue = Array.from(inDegree.entries())
      .filter(([, deg]) => deg === 0)
      .map(([name]) => name);

    const result: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const neighbor of graph.get(node) || []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  private async runStep(name: string, command?: string): Promise<boolean> {
    if (!command) {
      console.log(`  ${name}: no command, skipped`);
      return true;
    }

    console.log(`  Running: ${command}`);
    const { execSync } = await import('child_process');
    try {
      execSync(command, { cwd: this.cwd, stdio: 'inherit' });
      console.log(`  ✓ ${name} passed`);
      return true;
    } catch {
      console.log(`  ✗ ${name} failed`);
      return false;
    }
  }

  private evaluateCondition(condition: string): boolean {
    // Very basic condition evaluation
    if (condition.includes("branch == 'main'")) {
      try {
        const { execSync } = require('child_process');
        const branch = execSync('git branch --show-current', { cwd: this.cwd, encoding: 'utf-8' }).trim();
        return branch === 'main' || branch === 'master';
      } catch {
        return false;
      }
    }
    return true;
  }
}
