import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { registerLocalCors } from '../cors.js';

test('CORS permits local frontend origins and POST preflight only', async () => {
  const app = Fastify();
  await registerLocalCors(app);
  app.get('/projects', async () => ({ projects: [] }));
  try {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3001']) {
      const response = await app.inject({ method: 'GET', url: '/projects', headers: { origin } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['access-control-allow-origin'], origin);
    }

    const preflight = await app.inject({
      method: 'OPTIONS', url: '/projects',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(String(preflight.headers['access-control-allow-methods']), /POST/);
    assert.match(String(preflight.headers['access-control-allow-headers']), /content-type/i);

    for (const origin of ['https://localhost:5173', 'http://localhost.evil.test:5173', 'http://example.com']) {
      const response = await app.inject({ method: 'GET', url: '/projects', headers: { origin } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    }
  } finally {
    await app.close();
  }
});
