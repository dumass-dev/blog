process.env.NODE_ENV = 'test';
import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

const PORT = 3899;

describe('GitHub Contributions API Route Tests (/api/github-contributions)', () => {
  let server;

  test('Setup test server', async () => {
    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(PORT, resolve));
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('GET /api/github-contributions returns 200 with structured data', async () => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/github-contributions?username=shuaib-mk',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => { body += chunk; });
        r.on('end', () => resolve({ status: r.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(data.username, 'Should include username');
    assert.ok(Array.isArray(data.years), 'Should include years array');
    assert.ok(data.total !== undefined, 'Should include total object');
  });

  test('GET /api/github-contributions handles mock data correctly', async () => {
    global.__mockGithubContributions = {
      source: 'mock',
      username: 'mock-user',
      total: { '2026': 577, lastYear: 577 },
      years: ['2026', '2025', '2024'],
      contributions: [
        { date: '2026-10-12', count: 5, level: 2 }
      ]
    };

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/github-contributions?username=mock-user',
      method: 'GET'
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (r) => {
        let body = '';
        r.on('data', chunk => { body += chunk; });
        r.on('end', () => resolve({ status: r.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });

    delete global.__mockGithubContributions;

    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.username, 'mock-user');
    assert.strictEqual(data.total['2026'], 577);
    assert.strictEqual(data.contributions[0].count, 5);
  });
});
