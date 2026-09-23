process.env.NODE_ENV = 'test';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { safeApiFetch } from '../src/supabase.js';

describe('Mobile Latency & safeApiFetch Timeout Resilience Tests', () => {
  let server;
  let serverPort;

  before((_, done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/slow-entry') {
        // Simulate mobile latency (1.5s delay)
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'entry-123', title: 'Mobile Latency Entry', content: 'Entry body' }));
        }, 1500);
      } else if (req.url === '/extremely-slow-entry') {
        // Simulate server hang (6000ms delay)
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'entry-999', title: 'Hanging Entry' }));
        }, 6000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  test('safeApiFetch succeeds on primary attempt when request takes 1.5s (normal mobile latency)', async () => {
    const startTime = Date.now();
    const result = await safeApiFetch(`http://127.0.0.1:${serverPort}/slow-entry`);
    const duration = Date.now() - startTime;

    assert.notStrictEqual(result, null, 'safeApiFetch MUST NOT return null for 1.5s mobile latency request');
    assert.strictEqual(result.id, 'entry-123');
    assert.strictEqual(result.title, 'Mobile Latency Entry');
    assert.ok(duration >= 1400 && duration < 4000, `Expected duration ~1500ms, got ${duration}ms`);
  });

  test('safeApiFetch still times out and returns null if custom timeout is exceeded', async () => {
    const result = await safeApiFetch(`http://127.0.0.1:${serverPort}/slow-entry`, { timeout: 300 });
    assert.strictEqual(result, null, 'safeApiFetch MUST return null when fetch duration exceeds specified timeout');
  });
});
