import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractSkillPhases, mapPhase, resolveExecutionProfile } from './phase-map.js';

test('resolveExecutionProfile returns skill-specific phases', () => {
  const profile = resolveExecutionProfile({ skillName: 'ralph' });
  assert.equal(profile.agent, 'ralph');
  assert.equal(profile.source, 'skill-doc');
  assert.deepEqual(profile.phases.slice(0, 3), [
    'routing',
    'context',
    'review-progress-check-todo-list-and-prior-state',
  ]);
  assert.equal(profile.phases.at(-1), 'complete');
});

test('mapPhase infers OMX-like phases from activity messages', () => {
  const profile = resolveExecutionProfile({ taskType: 'planning' });
  assert.equal(
    mapPhase({ status: 'completed', message: 'Loaded workspace instructions', profile }),
    'context',
  );
  assert.equal(
    mapPhase({ status: 'running', message: 'Invoking tool diagnostics', profile }),
    'tool-exec',
  );
  assert.equal(
    mapPhase({ status: 'completed', message: 'Response complete', profile }),
    'complete',
  );
});

test('extractSkillPhases reads phase list from actual skill-process sections', () => {
  const phases = extractSkillPhases(`
# Demo Skill

## Process

1. **Capture Error Output**
2. **Analyze Root Cause**
3. **Generate Fixes**
4. **Verify Fix**
`);

  assert.deepEqual(phases, [
    'capture-error-output',
    'analyze-root-cause',
    'generate-fixes',
    'verify-fix',
  ]);
});

test('resolveExecutionProfile uses skill-doc phases when SKILL.md exists', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-phase-'));

  try {
    const skillDir = join(cwd, 'skills', 'build-fix');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `
# Build Fix Skill

## Workflow

1. **Discover Context**
2. **Draft Patch**
3. **Verify Result**
`);

    const profile = resolveExecutionProfile({ skillName: 'build-fix', cwd });
    assert.equal(profile.source, 'skill-doc');
    assert.deepEqual(profile.phases, ['routing', 'context', 'discover-context', 'draft-patch', 'verify-result', 'complete']);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
