/**
 * Deep Interview Engine - Socratic requirements clarification
 */

import { runModelPrompt, ModelRunOptions } from '../model-runner.js';

export class DeepInterviewEngine {
  private cwd: string;
  private options: ModelRunOptions;

  constructor(
    cwd: string,
    options: ModelRunOptions = {}
  ) {
    this.cwd = cwd;
    this.options = options;
  }

  async run(topic?: string): Promise<void> {
    console.log('\n=================================');
    console.log('  OMK Deep Interview');
    console.log('=================================\n');

    const prompt = `You are conducting a Socratic deep interview to clarify requirements.
${topic ? `Topic: ${topic}\n` : ''}

Rules:
1. Ask ONE clear question at a time.
2. Wait for the user's answer before proceeding.
3. Use the answer to probe deeper into assumptions, edge cases, and constraints.
4. After 3-5 exchanges, summarize the clarified requirements in a structured format.
5. Since this is a non-interactive batch run, simulate a realistic interview by asking the most important opening question, then providing a plausible user response, then continuing the dialogue for 3-5 rounds, and finally outputting the summary.

Begin now.`;

    const result = await runModelPrompt(prompt, this.options);
    console.log(result.stdout);
  }
}
