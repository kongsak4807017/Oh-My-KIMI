import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectSkillInvocations,
  isActionableAgentRequest,
  listAvailableSkills,
  loadSkillContent,
  normalizeSkillName,
  stripCliFlags,
} from './runtime.js';

test('normalizeSkillName applies aliases and strips dollar prefix', () => {
  assert.equal(normalizeSkillName('$fix'), 'build-fix');
  assert.equal(normalizeSkillName('git'), 'git-master');
  assert.equal(normalizeSkillName('ralph'), 'ralph');
});

test('stripCliFlags removes OMK CLI flags while preserving free-form args', () => {
  const args = ['--browser', '--high', '--provider', 'cli', '--api-key', 'secret', 'implement', 'feature', '--yolo'];
  assert.deepEqual(stripCliFlags(args), ['implement', 'feature']);
});

test('detectSkillInvocations prefers explicit skills and preserves order', () => {
  const detected = detectSkillInvocations('please use $plan then $code-review for this change');
  assert.deepEqual(
    detected.map(item => item.skillName),
    ['plan', 'code-review'],
  );
  assert(detected.every(item => item.kind === 'explicit'));
});

test('detectSkillInvocations falls back to keyword routing when no explicit skill is present', () => {
  const detected = detectSkillInvocations('can you code review this and keep going until it is done');
  assert.deepEqual(
    detected.map(item => item.skillName),
    ['ralph', 'code-review'],
  );
});

test('isActionableAgentRequest detects English and Thai execution intent', () => {
  assert.equal(isActionableAgentRequest('please inspect this repo and run tests'), true);
  assert.equal(isActionableAgentRequest('ตรวจ process ใน workspace ให้หน่อย'), true);
  assert.equal(isActionableAgentRequest('what is a promise in JavaScript?'), false);
});

test('listAvailableSkills and loadSkillContent read project skill directories', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-runtime-'));

  try {
    const skillsRoot = join(cwd, 'skills');
    mkdirSync(join(skillsRoot, 'plan'), { recursive: true });
    mkdirSync(join(skillsRoot, 'build-fix'), { recursive: true });
    writeFileSync(join(skillsRoot, 'plan', 'SKILL.md'), '# plan');
    writeFileSync(join(skillsRoot, 'build-fix', 'SKILL.md'), '# build-fix');

    const skills = listAvailableSkills(cwd);
    assert(skills.includes('build-fix'));
    assert(skills.includes('plan'));

    const skill = loadSkillContent(cwd, 'plan');
    assert(skill);
    assert.equal(skill?.skillName, 'plan');
    assert.equal(skill?.source, 'project');
    assert.equal(skill?.content, '# plan');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
