import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { RagSearchTool } from './rag.js';

test('RagSearchTool returns compact local snippets within token budget', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-rag-'));

  try {
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'auth.ts'), [
      'export function refreshToken() {',
      '  return "refresh";',
      '}',
      '',
      'export function loginWithOAuth() {',
      '  return refreshToken();',
      '}',
    ].join('\n'));
    writeFileSync(join(cwd, 'src', 'billing.ts'), [
      'export function chargeCustomer() {',
      '  return "paid";',
      '}',
    ].join('\n'));

    const result = await new RagSearchTool(cwd).search({
      query: 'oauth refresh token',
      maxTokens: 1000,
      maxFiles: 4,
      maxChunks: 4,
    });

    assert.equal(result.query, 'oauth refresh token');
    assert(result.estimatedTokens <= result.tokenBudget);
    assert(result.sources.some(source => source.path?.includes('auth.ts')));
    assert(result.context.includes('refreshToken'));
    assert(!result.context.includes('chargeCustomer'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('RagSearchTool persists chunk index and handles semantic aliases', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-rag-semantic-'));

  try {
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'session.ts'), [
      'export function rotateCredentials() {',
      '  return "new-secret";',
      '}',
      '',
      'export function signInSession() {',
      '  return rotateCredentials();',
      '}',
    ].join('\n'));

    const result = await new RagSearchTool(cwd).search({
      query: 'oauth token renewal',
      maxTokens: 1000,
      maxFiles: 4,
      maxChunks: 4,
    });

    assert(result.indexPath);
    assert(existsSync(result.indexPath));
    assert(result.sources.some(source => source.path?.includes('session.ts')));
    assert(result.context.includes('rotateCredentials'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
