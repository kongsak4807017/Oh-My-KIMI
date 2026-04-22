import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLaneAssignments } from './lane-orchestrator.js';

test('parseLaneAssignments reads bounded lane fields', () => {
  const assignments = parseLaneAssignments([
    '1. Auth audit | objective: inspect token refresh flow | scope: src/auth | verify: run auth tests',
    '2. Docs update | objective: update usage docs | scope: README.md | verify: review rendered markdown',
  ].join('\n'), 3);

  assert.equal(assignments.length, 2);
  assert.equal(assignments[0].id, 'lane-1');
  assert.equal(assignments[0].title, 'Auth audit');
  assert.equal(assignments[0].objective, 'inspect token refresh flow');
  assert.equal(assignments[0].writeScope, 'src/auth');
  assert.equal(assignments[0].verification, 'run auth tests');
  assert.equal(assignments[1].id, 'lane-2');
});

test('parseLaneAssignments falls back to a single lane for unstructured plans', () => {
  const assignments = parseLaneAssignments('Investigate the repository and report risks.', 4);

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].id, 'lane-1');
  assert.match(assignments[0].objective, /Investigate/);
  assert.match(assignments[0].writeScope, /read-only/);
});
