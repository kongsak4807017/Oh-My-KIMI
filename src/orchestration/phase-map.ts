import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ExecutionProfile {
  key: string;
  agent: string;
  role: string;
  task: string;
  phases: string[];
  source: 'builtin' | 'skill-doc';
}

const DEFAULT_PHASES = ['routing', 'context', 'analyze', 'execute', 'verify', 'complete'];

const SKILL_PROFILES: Record<string, ExecutionProfile> = {
  ralph: { key: 'ralph', agent: 'ralph', role: 'executor', task: 'driving the task to completion', phases: ['routing', 'context', 'plan-check', 'execute', 'verify', 'complete'], source: 'builtin' },
  plan: { key: 'plan', agent: 'planner', role: 'planner', task: 'building an execution plan', phases: ['routing', 'context', 'analyze', 'draft-plan', 'review', 'complete'], source: 'builtin' },
  ralplan: { key: 'ralplan', agent: 'planner', role: 'planner', task: 'building a consensus plan', phases: ['routing', 'context', 'analyze', 'deliberate', 'draft-plan', 'review', 'complete'], source: 'builtin' },
  'deep-interview': { key: 'deep-interview', agent: 'interviewer', role: 'analyst', task: 'clarifying requirements', phases: ['routing', 'context', 'questioning', 'clarify', 'spec', 'complete'], source: 'builtin' },
  autopilot: { key: 'autopilot', agent: 'autopilot', role: 'orchestrator', task: 'running the full delivery workflow', phases: ['routing', 'context', 'analyze', 'plan', 'execute', 'verify', 'complete'], source: 'builtin' },
  team: { key: 'team', agent: 'team-lead', role: 'coordinator', task: 'coordinating multiple lanes', phases: ['routing', 'context', 'assign', 'execute', 'integrate', 'verify', 'complete'], source: 'builtin' },
  swarm: { key: 'swarm', agent: 'swarm-lead', role: 'coordinator', task: 'coordinating swarm execution', phases: ['routing', 'context', 'assign', 'execute', 'integrate', 'verify', 'complete'], source: 'builtin' },
  'code-review': { key: 'code-review', agent: 'reviewer', role: 'code-reviewer', task: 'reviewing code changes', phases: ['routing', 'context', 'inspect', 'findings', 'summary', 'complete'], source: 'builtin' },
  'security-review': { key: 'security-review', agent: 'security', role: 'security-reviewer', task: 'auditing trust boundaries', phases: ['routing', 'context', 'inspect', 'threat-model', 'findings', 'complete'], source: 'builtin' },
  'build-fix': { key: 'build-fix', agent: 'build-fixer', role: 'build-fixer', task: 'repairing the build', phases: ['routing', 'context', 'diagnose', 'patch', 'verify', 'complete'], source: 'builtin' },
  tdd: { key: 'tdd', agent: 'test-engineer', role: 'test-engineer', task: 'driving test-first delivery', phases: ['routing', 'context', 'test-design', 'implement', 'verify', 'complete'], source: 'builtin' },
  analyze: { key: 'analyze', agent: 'debugger', role: 'debugger', task: 'analyzing the codebase', phases: ['routing', 'context', 'inspect', 'diagnose', 'report', 'complete'], source: 'builtin' },
  'visual-verdict': { key: 'visual-verdict', agent: 'vision', role: 'vision', task: 'comparing visual output', phases: ['routing', 'context', 'capture', 'compare', 'verdict', 'complete'], source: 'builtin' },
  cancel: { key: 'cancel', agent: 'control', role: 'controller', task: 'stopping active workflows', phases: ['routing', 'shutdown', 'complete'], source: 'builtin' },
};

const TASK_PROFILES: Record<string, ExecutionProfile> = {
  'repository-analysis': { key: 'repository-analysis', agent: 'explorer', role: 'explorer', task: 'analyzing repository structure', phases: ['routing', 'clone', 'index', 'analyze', 'report', 'complete'], source: 'builtin' },
  debugging: { key: 'debugging', agent: 'debugger', role: 'debugger', task: 'tracing the root cause', phases: ['routing', 'context', 'diagnose', 'patch', 'verify', 'complete'], source: 'builtin' },
  planning: { key: 'planning', agent: 'planner', role: 'planner', task: 'mapping the work', phases: ['routing', 'context', 'analyze', 'draft-plan', 'review', 'complete'], source: 'builtin' },
  refactoring: { key: 'refactoring', agent: 'executor', role: 'executor', task: 'reshaping the implementation', phases: ['routing', 'context', 'inspect', 'refactor', 'verify', 'complete'], source: 'builtin' },
  'general-chat': { key: 'general-chat', agent: 'provider', role: 'assistant', task: 'answering with project context', phases: ['routing', 'context', 'analyze', 'respond', 'complete'], source: 'builtin' },
};

const PHASE_SECTION_HEADERS = [
  'process',
  'steps',
  'pipeline',
  'workflow',
  'qa cycle',
  'tdd cycle',
  'lifecycle',
  'how it works',
];

function resolveSkillPath(cwd: string, skillName: string): string | null {
  const roots = [
    join(cwd, '.omk', 'skills'),
    join(cwd, 'skills'),
    join(homedir(), '.omk', 'skills'),
  ];

  for (const root of roots) {
    const candidate = join(root, skillName, 'SKILL.md');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizePhaseLabel(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/^[0-9]+[.)-]?\s*/, '')
    .replace(/^phase\s+[0-9]+:?\s*/i, '')
    .replace(/[^\p{L}\p{N}\s/-]+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function uniquePhases(phases: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const phase of phases) {
    if (!phase || seen.has(phase)) continue;
    seen.add(phase);
    result.push(phase);
  }
  return result;
}

export function extractSkillPhases(skillContent: string): string[] {
  const lines = skillContent.split(/\r?\n/);
  const extracted: string[] = [];
  let inPhaseSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^##+\s+(.*)$/);
    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      inPhaseSection = PHASE_SECTION_HEADERS.some(candidate => heading.includes(candidate));

      if (inPhaseSection) {
        continue;
      }

      if (extracted.length > 0) {
        break;
      }
    }

    if (!inPhaseSection) continue;

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    const numberedHeading = trimmed.match(/^###\s+(?:phase\s+\d+:?\s*)?(.*)$/i);
    const bullet = trimmed.match(/^-\s+\*\*(.*?)\*\*/);

    const label = numbered?.[1] ?? numberedHeading?.[1] ?? bullet?.[1];
    if (!label) continue;

    const normalized = normalizePhaseLabel(label);
    if (normalized) {
      extracted.push(normalized);
    }
  }

  return uniquePhases(extracted);
}

function deriveSkillProfile(cwd: string, skillName: string): ExecutionProfile | null {
  const base = SKILL_PROFILES[skillName];
  if (!base) return null;

  const skillPath = resolveSkillPath(cwd, skillName);
  if (!skillPath) return base;

  const content = readFileSync(skillPath, 'utf-8');
  const extracted = extractSkillPhases(content);
  if (extracted.length === 0) {
    return base;
  }

  const phases = uniquePhases(['routing', 'context', ...extracted, 'complete']);
  return {
    ...base,
    phases,
    source: 'skill-doc',
  };
}

export function resolveExecutionProfile(input: { skillName?: string; taskType?: string; cwd?: string }): ExecutionProfile {
  if (input.skillName) {
    const derived = deriveSkillProfile(input.cwd ?? process.cwd(), input.skillName);
    if (derived) return derived;
  }

  if (input.taskType && TASK_PROFILES[input.taskType]) {
    return TASK_PROFILES[input.taskType];
  }

  if (input.skillName) {
    return {
      key: input.skillName,
      agent: 'executor',
      role: 'executor',
      task: `running ${input.skillName}`,
      phases: DEFAULT_PHASES,
      source: 'builtin',
    };
  }

  return TASK_PROFILES['general-chat'];
}

export function mapPhase(input: {
  status: 'running' | 'completed' | 'failed';
  message: string;
  profile: ExecutionProfile;
  explicitPhase?: string;
}): string {
  if (input.explicitPhase) return input.explicitPhase;
  if (input.status === 'failed') return 'failed';
  if (input.status === 'completed' && /response complete|summary|verdict|report/i.test(input.message)) return 'complete';

  const lower = input.message.toLowerCase();
  const candidates: Array<[string, string[]]> = [
    ['routing', ['route', 'selected skill lane', 'routed request', 'router ->']],
    ['context', ['context', 'workspace instructions', 'loaded skill instructions', 'prepared prompt context']],
    ['clone', ['cloning repository']],
    ['index', ['indexed', 'index']],
    ['tool-exec', ['tool', 'invoking tool', 'tool completed']],
    ['analyze', ['analyz', 'inspect', 'reviewing', 'diagnos', 'questioning']],
    ['draft-plan', ['plan', 'consensus plan']],
    ['plan-check', ['plan-check']],
    ['assign', ['assign', 'coordinating']],
    ['execute', ['execute', 'patch', 'refactor', 'implement', 'handoff']],
    ['verify', ['verify', 'verification']],
    ['respond', ['streaming', 'response']],
    ['report', ['analysis complete', 'response complete', 'report']],
    ['complete', ['complete', 'finished']],
  ];

  for (const [phase, keywords] of candidates) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return phase;
    }
  }

  for (const phase of input.profile.phases) {
    if (phase === 'routing' || phase === 'context' || phase === 'complete') continue;
    const tokens = phase.split('-');
    if (tokens.some(token => token.length >= 4 && lower.includes(token))) {
      return phase;
    }
  }

  return input.profile.phases.find(phase => phase !== 'complete') ?? input.profile.phases[0];
}
