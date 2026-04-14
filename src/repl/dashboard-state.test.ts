import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DashboardState } from './dashboard-state.js';

test('DashboardState persists timeline into .omk/state/dashboard-state.json', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-dashboard-'));
  mkdirSync(join(cwd, '.omk', 'state'), { recursive: true });

  try {
    const state = new DashboardState();
    state.configure(cwd);
    state.clear();
    state.updateFromActivity({
      agent: 'planner',
      role: 'planner',
      status: 'completed',
      message: 'Loaded workspace instructions',
      taskType: 'planning',
    });

    const file = join(cwd, '.omk', 'state', 'dashboard-state.json');
    assert.equal(existsSync(file), true);

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { timeline: Array<{ agent: string }>; currentAgent: string };
    assert.equal(parsed.currentAgent, 'planner');
    assert.equal(parsed.timeline.length, 1);
    assert.equal(parsed.timeline[0].agent, 'planner');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
