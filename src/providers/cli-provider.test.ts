import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { buildCLIInvocation } from './cli-provider.js';

test('buildCLIInvocation uses stdin print mode for Kimi CLI OAuth', () => {
  const invocation = buildCLIInvocation('kimi', {
    type: 'kimi-cli',
    model: 'kimi-test',
    reasoning: 'high',
  }, {
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(invocation.command, 'kimi');
  assert.deepEqual(invocation.args, [
    '--print',
    '--final-message-only',
    '--input-format',
    'text',
    '--thinking',
    '--model',
    'kimi-test',
  ]);
  assert.equal(invocation.stdin, 'hello');
});

test('buildCLIInvocation uses Gemini headless prompt mode', () => {
  const invocation = buildCLIInvocation('gemini', {
    type: 'gemini-cli',
    cliPath: 'gemini',
    model: 'gemini-test',
  }, {
    messages: [{ role: 'user', content: 'summarize' }],
  });

  assert.equal(invocation.command, 'gemini');
  assert.deepEqual(invocation.args, [
    '--prompt',
    'summarize',
    '--output-format',
    'text',
    '--model',
    'gemini-test',
  ]);
});

test('buildCLIInvocation uses Codex exec with last-message output', () => {
  const invocation = buildCLIInvocation('codex', {
    type: 'codex-cli',
    model: 'gpt-test',
    cliArgs: ['--profile', 'default'],
  }, {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'hello' },
    ],
  });

  assert.equal(invocation.command, 'codex');
  assert.equal(invocation.stdin, 'SYSTEM:\nBe concise.\n\nUSER:\nhello');
  assert.ok(invocation.args.includes('exec'));
  assert.ok(invocation.args.includes('--output-last-message'));
  assert.ok(invocation.args.includes('--skip-git-repo-check'));
  assert.ok(invocation.args.includes('--sandbox'));
  assert.ok(invocation.args.includes('read-only'));
  assert.ok(invocation.args.includes('--profile'));
  assert.equal(invocation.args.at(-1), '-');
  assert.ok(invocation.outputFile?.endsWith('last-message.txt'));
  if (invocation.cleanupDir) {
    rmSync(invocation.cleanupDir, { recursive: true, force: true });
  }
});
