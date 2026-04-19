import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveProviderConfig } from './config.js';

test('resolveProviderConfig merges project provider overrides and CLI values', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-config-'));

  try {
    mkdirSync(join(cwd, '.omk'), { recursive: true });
    writeFileSync(join(cwd, '.omk', 'config.toml'), `
provider = "openrouter"
model = "default/model"

[headers]
X-Global = "one"

[providers.openrouter]
model = "router/model"
baseUrl = "https://openrouter.ai/api/v1"
apiKeyEnv = "OPENROUTER_API_KEY"

[providers.openrouter.headers]
X-Provider = "two"
`);

    const config = resolveProviderConfig({
      type: 'openrouter',
      model: 'cli/model',
      headers: { 'X-CLI': 'three' },
    }, cwd);

    assert.equal(config.type, 'openrouter');
    assert.equal(config.model, 'cli/model');
    assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(config.apiKeyEnv, 'OPENROUTER_API_KEY');
    assert.deepEqual(config.headers, {
      'X-Global': 'one',
      'X-Provider': 'two',
      'X-CLI': 'three',
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('resolveProviderConfig ignores undefined CLI fields', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omk-config-undefined-'));

  try {
    mkdirSync(join(cwd, '.omk'), { recursive: true });
    writeFileSync(join(cwd, '.omk', 'config.toml'), `
provider = "openrouter"
model = "router/model"

[providers.openrouter]
baseUrl = "https://openrouter.ai/api/v1"
apiKeyEnv = "OPENROUTER_API_KEY"
`);

    const config = resolveProviderConfig({
      type: undefined,
      model: undefined,
      baseUrl: undefined,
      apiKeyEnv: undefined,
    }, cwd);

    assert.equal(config.type, 'openrouter');
    assert.equal(config.model, 'router/model');
    assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(config.apiKeyEnv, 'OPENROUTER_API_KEY');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
