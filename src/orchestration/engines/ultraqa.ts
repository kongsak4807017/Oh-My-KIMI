/**
 * UltraQA Engine - Intensive QA cycling for critical code
 */

import { runModelPrompt, runModelToolLoop, ModelRunOptions } from '../model-runner.js';
import { existsSync } from 'fs';
import { join } from 'path';

export class UltraQAEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(targetPath?: string): Promise<void> {
    const target = targetPath || '.';
    console.log('\n[OMK UltraQA] Starting QA cycle\n');

    const report: string[] = ['# UltraQA Report\n'];
    const timestamp = new Date().toISOString();
    report.push(`**Date:** ${timestamp}\n`);
    report.push(`**Target:** ${target}\n\n`);

    // Phase 1: Automated checks
    console.log('## Phase 1: Automated Checks\n');
    const automated = await this.runAutomatedChecks(target);
    report.push('## Phase 1: Automated Checks\n' + automated + '\n');

    // Phase 2: AI Review
    console.log('## Phase 2: AI Review\n');
    const review = await this.runAIReview(target);
    report.push('## Phase 2: AI Review\n' + review + '\n');

    // Phase 3: Edge Cases
    console.log('## Phase 3: Edge Cases\n');
    const edgeCases = await this.runEdgeCases(target);
    report.push('## Phase 3: Edge Cases\n' + edgeCases + '\n');

    // Phase 4: Final Verify
    console.log('## Phase 4: Final Verification\n');
    const final = await this.runFinalVerify(target);
    report.push('## Phase 4: Final Verification\n' + final + '\n');

    // Save report
    const reportDir = join(this.cwd, '.omk', 'qa-reports');
    const fs = await import('fs');
    if (!existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, `ultraqa-${Date.now()}.md`);
    fs.writeFileSync(reportPath, report.join('\n'));

    console.log(`\n[OMK UltraQA] Report saved: ${reportPath}\n`);
  }

  private async runAutomatedChecks(target: string): Promise<string> {
    const results: string[] = [];

    // Lint
    try {
      const pkgPath = join(this.cwd, 'package.json');
      if (existsSync(pkgPath)) {
        const res = await this.runCommand('npm run lint --if-present');
        results.push(`Lint: ${res}`);
      }
    } catch {
      results.push('Lint: skipped or failed');
    }

    // Type check
    try {
      const tsConfig = join(this.cwd, 'tsconfig.json');
      if (existsSync(tsConfig)) {
        const res = await this.runCommand('npx tsc --noEmit');
        results.push(`Type check: ${res}`);
      }
    } catch {
      results.push('Type check: skipped or failed');
    }

    // Tests
    try {
      const res = await this.runCommand('npm test --if-present');
      results.push(`Tests: ${res}`);
    } catch {
      results.push('Tests: skipped or failed');
    }

    return results.join('\n');
  }

  private async runAIReview(target: string): Promise<string> {
    const prompt = `Review the code at ${target} for quality, security, and performance issues.
Look for obvious bugs, anti-patterns, missing error handling, and hardcoded secrets.
Provide a concise summary.`;
    const result = await runModelToolLoop(prompt, this.cwd, this.options, { maxIterations: 3 });
    return result.stdout;
  }

  private async runEdgeCases(target: string): Promise<string> {
    const prompt = `For the code at ${target}, identify boundary conditions and edge cases that should be tested.
Generate test cases (pseudocode or actual code) for the top 3 edge cases.`;
    const result = await runModelToolLoop(prompt, this.cwd, this.options, { maxIterations: 3 });
    return result.stdout;
  }

  private async runFinalVerify(target: string): Promise<string> {
    const prompt = `Perform a final verification of ${target}.
Check: documentation completeness, E2E sanity, deployment readiness.
Give a PASS or FAIL verdict with bullet points.`;
    const result = await runModelPrompt(prompt, this.options);
    return result.stdout;
  }

  private async runCommand(cmd: string): Promise<string> {
    const { execSync } = await import('child_process');
    try {
      return execSync(cmd, { cwd: this.cwd, encoding: 'utf-8' });
    } catch (err: any) {
      return err.stdout || err.message || 'failed';
    }
  }
}
