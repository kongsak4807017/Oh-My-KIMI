import { runModelPrompt, runModelToolLoop, ModelRunOptions, RunResult } from './model-runner.js';

export interface LaneOrchestratorOptions {
  cwd: string;
  task: string;
  laneCount: number;
  mode: 'team' | 'ultrawork';
  runnerOptions?: ModelRunOptions;
  laneMaxIterations?: number;
}

export interface LaneAssignment {
  id: string;
  title: string;
  objective: string;
  writeScope: string;
  verification: string;
}

export interface LaneResult {
  assignment: LaneAssignment;
  output: string;
  toolCalls: number;
  success: boolean;
  error?: string;
}

export interface LaneOrchestrationResult {
  assignments: LaneAssignment[];
  laneResults: LaneResult[];
  integration: RunResult;
  verification: RunResult;
}

const DEFAULT_WRITE_SCOPE = 'read-only unless the assignment explicitly names files to change';
const DEFAULT_VERIFICATION = 'report evidence from tools and any checks that were run';

export function parseLaneAssignments(text: string, laneCount: number): LaneAssignment[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const assignments: LaneAssignment[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:\d+[.):-]\s+|-\s+)(.*)$/);
    if (!match?.[1]) continue;

    const parsed = parseAssignmentBody(match[1], assignments.length + 1);
    assignments.push(parsed);
    if (assignments.length >= laneCount) break;
  }

  if (assignments.length > 0) {
    return assignments;
  }

  const fallback = text.trim() || 'Investigate and complete the requested work.';
  return [{
    id: 'lane-1',
    title: fallback.slice(0, 80),
    objective: fallback,
    writeScope: DEFAULT_WRITE_SCOPE,
    verification: DEFAULT_VERIFICATION,
  }];
}

function parseAssignmentBody(body: string, index: number): LaneAssignment {
  const parts = body.split(/\s+\|\s+/).map(part => part.trim()).filter(Boolean);
  const [titlePart = body] = parts;
  const fields = new Map<string, string>();

  for (const part of parts.slice(1)) {
    const field = part.match(/^([a-z][a-z -]*):\s*(.*)$/i);
    if (field?.[1]) {
      fields.set(field[1].toLowerCase().replace(/\s+/g, '-'), field[2]?.trim() || '');
    }
  }

  return {
    id: `lane-${index}`,
    title: titlePart.replace(/^\[[^\]]+\]\s*/, '').trim() || `Lane ${index}`,
    objective: fields.get('objective') || titlePart,
    writeScope: fields.get('scope') || fields.get('write-scope') || DEFAULT_WRITE_SCOPE,
    verification: fields.get('verify') || fields.get('verification') || DEFAULT_VERIFICATION,
  };
}

export async function runLaneOrchestrator(options: LaneOrchestratorOptions): Promise<LaneOrchestrationResult> {
  const laneCount = Math.max(1, options.laneCount);
  const modeLabel = options.mode === 'ultrawork' ? 'OMK Ultrawork' : 'OMK Team';
  const laneMaxIterations = options.laneMaxIterations ?? (options.mode === 'ultrawork' ? 4 : 5);
  const runnerOptions = options.runnerOptions ?? {};

  console.log(`\n[${modeLabel}] Orchestrating ${laneCount} provider-backed lane(s)\n`);

  const assignments = await planAssignments(options.task, laneCount, options.mode, runnerOptions);

  console.log(`[${modeLabel}] Dispatching lanes with tool access\n`);
  const laneResults = await Promise.all(
    assignments.map(assignment => runLane({
      assignment,
      cwd: options.cwd,
      task: options.task,
      mode: options.mode,
      runnerOptions,
      laneMaxIterations,
    }))
  );

  console.log(`\n[${modeLabel}] Integrating lane outputs\n`);
  const integration = await runModelToolLoop(
    buildIntegrationPrompt(options.task, laneResults, options.mode),
    options.cwd,
    runnerOptions,
    {
      maxIterations: 4,
      showEvidence: true,
      systemPrompt: [
        'You are the lead orchestrator integrating parallel worker outputs.',
        'Use tools to inspect the workspace before claiming completion.',
        'If lane outputs conflict, choose the least risky path and call out the conflict.',
      ].join('\n'),
    }
  );

  console.log(`\n[${modeLabel}] Verifying integrated result\n`);
  const verification = await runModelToolLoop(
    buildVerificationPrompt(options.task, laneResults, integration.stdout, options.mode),
    options.cwd,
    runnerOptions,
    {
      maxIterations: 3,
      showEvidence: true,
      systemPrompt: [
        'You are the verifier for a coordinated agent run.',
        'Run or request the most relevant checks available in this workspace.',
        'Return PASS only when evidence supports it; otherwise return FAIL with next actions.',
      ].join('\n'),
    }
  );

  return {
    assignments,
    laneResults,
    integration,
    verification,
  };
}

async function planAssignments(
  task: string,
  laneCount: number,
  mode: 'team' | 'ultrawork',
  runnerOptions: ModelRunOptions
): Promise<LaneAssignment[]> {
  const planningPrompt = [
    `You are planning ${laneCount} independent ${mode} lanes for an autonomous coding orchestrator.`,
    'Return only a numbered list. Use this exact shape:',
    '1. Title | objective: concrete bounded objective | scope: files or area owned by this lane | verify: evidence/check expected',
    '',
    'Planning rules:',
    '- Make lanes independent where possible.',
    '- Give each lane a clear ownership boundary.',
    '- Avoid overlapping write scopes. If work is exploratory, mark scope as read-only.',
    '- Include one integration/verification-friendly outcome per lane.',
    '',
    `Task:\n${task}`,
  ].join('\n');

  const plan = await runModelPrompt(planningPrompt, runnerOptions);
  const assignments = parseLaneAssignments(plan.stdout, laneCount);

  if (assignments.length < laneCount && assignments.length === 1) {
    return assignments;
  }

  return assignments.slice(0, laneCount);
}

async function runLane(args: {
  assignment: LaneAssignment;
  cwd: string;
  task: string;
  mode: 'team' | 'ultrawork';
  runnerOptions: ModelRunOptions;
  laneMaxIterations: number;
}): Promise<LaneResult> {
  const { assignment, cwd, task, mode, runnerOptions, laneMaxIterations } = args;
  const modeLabel = mode === 'ultrawork' ? 'OMK Ultrawork' : 'OMK Team';

  console.log(`[${modeLabel}] ${assignment.id}: ${assignment.title}`);
  console.log(`  scope: ${assignment.writeScope}`);

  try {
    const result = await runModelToolLoop(
      buildLanePrompt(task, assignment, mode),
      cwd,
      runnerOptions,
      {
        maxIterations: laneMaxIterations,
        showEvidence: true,
        systemPrompt: [
          `You are ${assignment.id}, a bounded ${mode} worker lane.`,
          'You are not alone in the workspace. Do not revert other lanes or unrelated user changes.',
          'Stay inside your assigned ownership boundary.',
          'Use tools for real evidence. Do not pretend to inspect files or run checks.',
          'If your lane needs broader scope, report the blocker instead of freelancing.',
        ].join('\n'),
      }
    );

    return {
      assignment,
      output: result.stdout,
      toolCalls: result.toolCalls ?? 0,
      success: true,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[${modeLabel}] ${assignment.id} failed: ${error}`);
    return {
      assignment,
      output: '',
      toolCalls: 0,
      success: false,
      error,
    };
  }
}

function buildLanePrompt(task: string, assignment: LaneAssignment, mode: 'team' | 'ultrawork'): string {
  return [
    `Overall ${mode} task:`,
    task,
    '',
    `Lane: ${assignment.id}`,
    `Title: ${assignment.title}`,
    `Objective: ${assignment.objective}`,
    `Ownership/write scope: ${assignment.writeScope}`,
    `Expected verification: ${assignment.verification}`,
    '',
    'Execute this lane as far as safely possible.',
    'Required final shape:',
    '- Work completed',
    '- Evidence gathered',
    '- Files changed, if any',
    '- Blockers or handoff needs',
  ].join('\n');
}

function buildIntegrationPrompt(task: string, results: LaneResult[], mode: 'team' | 'ultrawork'): string {
  return [
    `Integrate this ${mode} run.`,
    '',
    `Original task:\n${task}`,
    '',
    'Lane results:',
    ...results.map(result => [
      `## ${result.assignment.id}: ${result.assignment.title}`,
      `success=${result.success} toolCalls=${result.toolCalls}`,
      result.error ? `error=${result.error}` : '',
      result.output || '(no output)',
    ].filter(Boolean).join('\n')),
    '',
    'Produce a coherent integrated result. If additional workspace inspection or edits are needed, use tools now.',
  ].join('\n\n');
}

function buildVerificationPrompt(
  task: string,
  results: LaneResult[],
  integrationOutput: string,
  mode: 'team' | 'ultrawork'
): string {
  return [
    `Verify this ${mode} orchestration run.`,
    '',
    `Original task:\n${task}`,
    '',
    `Lane status summary:\n${results.map(result => `- ${result.assignment.id}: success=${result.success}, toolCalls=${result.toolCalls}${result.error ? `, error=${result.error}` : ''}`).join('\n')}`,
    '',
    `Integration output:\n${integrationOutput}`,
    '',
    'Check whether the result is actually supported by evidence. Run the most relevant local checks when available.',
    'Respond with PASS or FAIL first, then concise evidence and remaining risks.',
  ].join('\n');
}
