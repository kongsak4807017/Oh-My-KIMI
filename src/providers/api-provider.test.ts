import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { APIProvider } from './api-provider.js';

test('APIProvider sends OpenAI-compatible chat requests with custom headers', async () => {
  const received: { headers?: Record<string, string | string[] | undefined>; body?: any } = {};

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      received.headers = req.headers;
      received.body = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert(address && typeof address === 'object');

    const provider = new APIProvider('custom');
    await provider.initialize({
      type: 'custom',
      apiKey: 'test-key',
      baseUrl: `http://127.0.0.1:${address.port}`,
      model: 'test-model',
      headers: { 'X-Test': 'yes' },
    });

    const response = await provider.chat({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{
        type: 'function',
        function: {
          name: 'read_file',
          parameters: { type: 'object', properties: {} },
        },
      }],
      reasoning: 'high',
    });

    assert.equal(response.content, 'ok');
    assert.equal(received.headers?.authorization, 'Bearer test-key');
    assert.equal(received.headers?.['x-test'], 'yes');
    assert.equal(received.body.model, 'test-model');
    assert.equal(received.body.tools[0].function.name, 'read_file');
    assert.equal(received.body.reasoning_effort, 'high');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
