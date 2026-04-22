/**
 * Shared skill/runtime helpers for OMK.
 * Mirrors OMX-style skill routing while keeping Kimi as the model provider.
 */

import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ResolvedSkill {
  skillName: string;
  skillPath: string;
  source: 'local' | 'project' | 'global';
}

export interface DetectedSkillInvocation {
  skillName: string;
  trigger: string;
  kind: 'explicit' | 'keyword';
}

interface KeywordRule {
  skillName: string;
  triggers: string[];
}

const EXPLICIT_SKILL_REGEX = /\$([a-z0-9][a-z0-9-]*)/gi;

const SKILL_ALIASES: Record<string, string> = {
  review: 'code-review',
  code: 'code-review',
  git: 'git-master',
  fix: 'build-fix',
  analyse: 'analyze',
  swarm: 'swarm',
  ultraqa: 'ultraqa',
  ultrawork: 'ultrawork',
  eco: 'ecomode',
  ecomode: 'ecomode',
  ralph: 'ralph',
  ralplan: 'ralplan',
};

const KEYWORD_RULES: KeywordRule[] = [
  { skillName: 'ralph', triggers: ['ralph', "don't stop", 'must complete', 'keep going'] },
  { skillName: 'autopilot', triggers: ['autopilot', 'build me', 'i want a'] },
  { skillName: 'ultrawork', triggers: ['ultrawork', 'ulw', 'parallel'] },
  { skillName: 'ultraqa', triggers: ['ultraqa'] },
  { skillName: 'analyze', triggers: ['analyze', 'investigate'] },
  { skillName: 'plan', triggers: ['plan this', 'plan the', "let's plan"] },
  { skillName: 'deep-interview', triggers: ['interview', 'deep interview', 'gather requirements', 'interview me', "don't assume", 'ouroboros'] },
  { skillName: 'ralplan', triggers: ['ralplan', 'consensus plan'] },
  { skillName: 'team', triggers: ['team', 'coordinated team'] },
  { skillName: 'swarm', triggers: ['swarm', 'coordinated swarm'] },
  { skillName: 'ecomode', triggers: ['ecomode', 'eco', 'budget'] },
  { skillName: 'cancel', triggers: ['cancel', 'stop', 'abort'] },
  { skillName: 'tdd', triggers: ['tdd', 'test first'] },
  { skillName: 'build-fix', triggers: ['fix build', 'type errors'] },
  { skillName: 'code-review', triggers: ['review code', 'code review', 'code-review'] },
  { skillName: 'security-review', triggers: ['security review'] },
  { skillName: 'web-clone', triggers: ['web-clone', 'clone site', 'clone website', 'copy webpage'] },
  { skillName: 'ai-slop-cleaner', triggers: ['cleanup', 'refactor', 'deslop'] },
];

const ACTIONABLE_PATTERNS = [
  // English developer intent.
  /\b(?:analyze|audit|build|check|commit|create|debug|diagnose|edit|execute|fix|implement|inspect|investigate|patch|push|read|refactor|review|run|search|test|update|verify|write)\b/i,
  /\b(?:codebase|repo|repository|workspace|project)\b/i,
  /\b(?:npm|node|git|tsc|eslint|prettier|cargo|python|pytest)\b/i,
  /(?:^|\s)(?:\.\/|src\/|dist\/|skills\/|\.omk\/|package\.json|tsconfig\.json|README\.md)\b/i,
  /@[\w./-]+/,

  // Thai developer intent.
  /(?:ทำ|จัดการ|แก้|แก้ไข|สร้าง|เขียน|อ่าน|ตรวจ|ตรวจสอบ|ค้นหา|รัน|ทดสอบ|สรุป|วิเคราะห์|ปรับ|ดู|ทำงานจริง|หลักฐาน)/i,
];

const FLAGS_WITH_VALUES = new Set(['--provider', '--model', '--reasoning', '--base-url', '--api-key', '--api-key-env', '--header']);
const FLAGS_WITHOUT_VALUES = new Set([
  '--api',
  '--kimi',
  '--openrouter',
  '--custom',
  '--browser',
  '--cli',
  '--kimi-cli',
  '--gemini-cli',
  '--codex-cli',
  '--high',
  '--thinking',
  '--yolo',
  '--passthrough',
  '--raw',
  '--shell',
  '--tui',
  '--force',
  '--dry-run',
  '--verbose',
  '--global',
]);

function getSkillRoots(cwd: string): Array<{ root: string; source: ResolvedSkill['source'] }> {
  return [
    { root: join(cwd, '.omk', 'skills'), source: 'local' },
    { root: join(cwd, 'skills'), source: 'project' },
    { root: join(homedir(), '.omk', 'skills'), source: 'global' },
  ];
}

export function normalizeSkillName(skillName: string): string {
  const normalized = skillName.trim().replace(/^\$/, '').toLowerCase();
  return SKILL_ALIASES[normalized] ?? normalized;
}

export function stripCliFlags(args: string[]): string[] {
  const cleaned: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      cleaned.push(arg);
      continue;
    }

    if (FLAGS_WITH_VALUES.has(arg)) {
      i++;
    } else if (FLAGS_WITHOUT_VALUES.has(arg)) {
      continue;
    }
  }

  return cleaned;
}

export function resolveSkill(cwd: string, skillName: string): ResolvedSkill | null {
  const normalized = normalizeSkillName(skillName);

  for (const { root, source } of getSkillRoots(cwd)) {
    const skillPath = join(root, normalized, 'SKILL.md');
    if (existsSync(skillPath)) {
      return {
        skillName: normalized,
        skillPath,
        source,
      };
    }
  }

  return null;
}

export function listAvailableSkills(cwd: string): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];

  for (const { root } of getSkillRoots(cwd)) {
    if (!existsSync(root)) continue;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(root, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;

      const normalized = normalizeSkillName(entry.name);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        skills.push(normalized);
      }
    }
  }

  return skills.sort((a, b) => a.localeCompare(b));
}

export function detectSkillInvocations(input: string): DetectedSkillInvocation[] {
  const explicitMatches: DetectedSkillInvocation[] = [];
  const seenExplicit = new Set<string>();

  for (const match of input.matchAll(EXPLICIT_SKILL_REGEX)) {
    const raw = match[1];
    const normalized = normalizeSkillName(raw);
    if (seenExplicit.has(normalized)) continue;
    seenExplicit.add(normalized);
    explicitMatches.push({
      skillName: normalized,
      trigger: `$${raw}`,
      kind: 'explicit',
    });
  }

  if (explicitMatches.length > 0) {
    return explicitMatches;
  }

  const lower = input.toLowerCase();
  const keywordMatches: DetectedSkillInvocation[] = [];
  const seenKeyword = new Set<string>();

  for (const rule of KEYWORD_RULES) {
    const trigger = rule.triggers.find(candidate => lower.includes(candidate));
    if (!trigger) continue;

    const normalized = normalizeSkillName(rule.skillName);
    if (seenKeyword.has(normalized)) continue;
    seenKeyword.add(normalized);
    keywordMatches.push({
      skillName: normalized,
      trigger,
      kind: 'keyword',
    });
  }

  return keywordMatches;
}

export function isActionableAgentRequest(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('$')) return true;
  return ACTIONABLE_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function buildSkillSystemPrompt(args: {
  skillName: string;
  skillContent: string;
  userInput: string;
  agentsContent?: string;
  source?: ResolvedSkill['source'];
}): string {
  const sourceLabel = args.source ? `Skill source: ${args.source}` : undefined;
  const agentsSection = args.agentsContent?.trim()
    ? `\n\nWorkspace AGENTS.md instructions:\n${args.agentsContent.trim()}`
    : '';

  return [
    `You are executing the ${args.skillName} skill inside OMK.`,
    sourceLabel,
    'Treat the skill instructions as mandatory workflow guidance.',
    'Use the configured provider as the reasoning engine, while preserving OMX-style orchestration behavior.',
    '',
    'Skill instructions:',
    args.skillContent.trim(),
    agentsSection,
    '',
    'User request:',
    args.userInput.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function getWorkspaceAgentsContent(cwd: string): string {
  const localPath = join(cwd, 'AGENTS.md');
  const globalPath = join(homedir(), '.omk', 'AGENTS.md');

  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  if (existsSync(globalPath)) {
    return readFileSync(globalPath, 'utf-8');
  }

  return '';
}

export function loadSkillContent(cwd: string, skillName: string): (ResolvedSkill & { content: string }) | null {
  const resolved = resolveSkill(cwd, skillName);
  if (!resolved) {
    return null;
  }

  return {
    ...resolved,
    content: readFileSync(resolved.skillPath, 'utf-8'),
  };
}

export function copySkillTree(srcRoot: string, dstRoot: string, force: boolean): void {
  if (!existsSync(srcRoot)) return;

  for (const entry of readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const srcPath = join(srcRoot, entry.name);
    const skillFile = join(srcPath, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const dstPath = join(dstRoot, entry.name);
    if (existsSync(dstPath) && !force) {
      continue;
    }

    mkdirSync(dstPath, { recursive: true });
    cpSync(srcPath, dstPath, {
      recursive: true,
      force: true,
    });
  }
}
