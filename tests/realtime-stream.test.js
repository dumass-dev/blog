process.env.NODE_ENV = 'test';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../api/index.js';

let PORT = 0;

describe('Realtime SSE Streaming & Live Updates Suite', () => {
  let server;
  const adminId = '00000000-0000-0000-0000-000000000000';
  const adminToken = 'admin-realtime-token';

  test('Setup test server with mock database', async () => {
    process.env.ADMIN_USER_ID = adminId;

    global.__mockSupabaseClient = () => ({
      auth: {
        getUser: async (token) => {
          if (token === adminToken) {
            return { data: { user: { id: adminId } }, error: null };
          }
          return { data: null, error: new Error('Invalid token') };
        }
      },
      from: (tableName) => {
        if (tableName === 'entries') {
          return {
            select: () => ({
              order: () => ({
                order: async () => ({
                  data: [{ id: 'post-uuid-1', title: 'Existing Entry', slug: 'existing-entry', status: 'published', type: 'journal' }],
                  error: null
                })
              }),
              eq: () => ({
                single: async () => ({
                  data: { id: 'post-uuid-1', title: 'Existing Entry', slug: 'existing-entry' },
                  error: null
                })
              })
            }),
            insert: (payload) => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'post-uuid-new', title: payload[0]?.title || 'New Post', slug: payload[0]?.slug || 'new-post', type: payload[0]?.type || 'journal' },
                  error: null
                })
              })
            }),
            update: (payload) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'post-uuid-1', title: payload.title || 'Updated Entry', slug: 'existing-entry', type: 'journal' },
                    error: null
                  })
                })
              })
            }),
            delete: () => ({
              eq: async () => ({ error: null })
            })
          };
        }

        if (tableName === 'public_published_entries') {
          const publishedRow = { id: 'post-uuid-1', slug: 'existing-entry', status: 'published', has_passcode: false };
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: publishedRow, error: null }),
                single: async () => ({ data: publishedRow, error: null })
              }),
              limit: async () => ({ data: [publishedRow], error: null })
            })
          };
        }

        if (tableName === 'about') {
          return {
            select: () => ({
              limit: async () => ({
                data: [{ id: 'about-uuid-1', author_name: 'q04ti', bio: 'Bio' }],
                error: null
              })
            }),
            update: (payload) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...payload, id: 'about-uuid-1' },
                    error: null
                  })
                })
              })
            })
          };
        }

        if (tableName === 'comments') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ id: 'comment-1', content: 'Great post!' }],
                  error: null
                })
              })
            }),
            insert: (payload) => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'comment-new-1', post_id: payload[0]?.post_id, content: payload[0]?.content },
                  error: null
                })
              })
            }),
            delete: () => ({
              eq: () => ({
                select: async () => ({
                  data: [{ id: 'comment-del-1' }],
                  error: null
                })
              })
            })
          };
        }

        if (tableName === 'reactions') {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ reaction_type: 'loved' }, { reaction_type: 'thoughtful' }],
                error: null
              })
            }),
            insert: async () => ({ error: null })
          };
        }

        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) })
        };
      }
    });

    server = http.createServer((req, res) => app(req, res));
    await new Promise(resolve => server.listen(0, resolve));
    PORT = server.address().port;
  });

  test('GET /api/sync-check returns status 200 with ok status and version timestamp', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/sync-check`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.ok(typeof data.version === 'number');
    assert.ok(data.timestamp);
  });

  test('GET /api/realtime-stream connects and receives live events on mutations', async () => {
    const receivedEvents = [];

    // 1. Establish SSE connection
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/realtime-stream',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    const connectedPromise = new Promise((resolve) => {
      req.on('response', (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/event-stream'));

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop(); // keep remainder

          for (const line of lines) {
            if (!line.trim()) continue;
            let event = 'message';
            let data = null;

            for (const part of line.split('\n')) {
              if (part.startsWith('event: ')) {
                event = part.replace('event: ', '').trim();
              } else if (part.startsWith('data: ')) {
                try {
                  data = JSON.parse(part.replace('data: ', '').trim());
                } catch {
                  data = part.replace('data: ', '').trim();
                }
              }
            }

            receivedEvents.push({ event, data });
            if (event === 'init') {
              resolve();
            }
          }
        });
      });
    });

    req.end();
    await connectedPromise;

    // 2. Trigger POST /api/posts -> should broadcast entry_created
    const createRes = await fetch(`http://127.0.0.1:${PORT}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'Realtime Live Post',
        content: 'Testing instant live updates without browser refresh'
      })
    });
    assert.strictEqual(createRes.status, 201);

    // Wait a brief tick for SSE delivery
    await new Promise(r => setTimeout(r, 100));
    const createdEvent = receivedEvents.find(e => e.event === 'entry_created');
    assert.ok(createdEvent, 'Client received entry_created SSE event');
    assert.strictEqual(createdEvent.data.op, 'INSERT');

    // 3. Trigger PUT /api/posts/:id -> should broadcast entry_updated
    const updateRes = await fetch(`http://127.0.0.1:${PORT}/api/posts/post-uuid-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'Edited Realtime Title',
        content: 'Updated content'
      })
    });
    assert.strictEqual(updateRes.status, 200);

    await new Promise(r => setTimeout(r, 100));
    const updatedEvent = receivedEvents.find(e => e.event === 'entry_updated');
    assert.ok(updatedEvent, 'Client received entry_updated SSE event');
    assert.strictEqual(updatedEvent.data.op, 'UPDATE');
    assert.strictEqual(updatedEvent.data.id, 'post-uuid-1');

    // 4. Trigger DELETE /api/posts/:id -> should broadcast entry_deleted
    const deleteRes = await fetch(`http://127.0.0.1:${PORT}/api/posts/post-uuid-1`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert.strictEqual(deleteRes.status, 200);

    await new Promise(r => setTimeout(r, 100));
    const deletedEvent = receivedEvents.find(e => e.event === 'entry_deleted');
    assert.ok(deletedEvent, 'Client received entry_deleted SSE event');
    assert.strictEqual(deletedEvent.data.op, 'DELETE');
    assert.strictEqual(deletedEvent.data.id, 'post-uuid-1');

    // 5. Trigger PUT /api/about -> should broadcast about_updated
    const aboutRes = await fetch(`http://127.0.0.1:${PORT}/api/about`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        author_name: 'q04ti Updated',
        bio: 'Updated bio text'
      })
    });
    assert.strictEqual(aboutRes.status, 200);

    await new Promise(r => setTimeout(r, 100));
    const aboutEvent = receivedEvents.find(e => e.event === 'about_updated');
    assert.ok(aboutEvent, 'Client received about_updated SSE event');

    // 6. Trigger POST /api/posts/:id/comments -> should broadcast comment_created
    const commentRes = await fetch(`http://127.0.0.1:${PORT}/api/posts/00000000-0000-0000-0000-000000000001/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Reader',
        content: 'Awesome live stream!'
      })
    });
    assert.strictEqual(commentRes.status, 201);

    await new Promise(r => setTimeout(r, 100));
    const commentEvent = receivedEvents.find(e => e.event === 'comment_created');
    assert.ok(commentEvent, 'Client received comment_created SSE event');
    assert.strictEqual(commentEvent.data.op, 'INSERT');

    // 7. Trigger POST /api/posts/:id/reactions -> should broadcast reaction_updated
    const reactRes = await fetch(`http://127.0.0.1:${PORT}/api/posts/00000000-0000-0000-0000-000000000001/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: 'loved' })
    });
    assert.strictEqual(reactRes.status, 200);

    await new Promise(r => setTimeout(r, 100));
    const reactEvent = receivedEvents.find(e => e.event === 'reaction_updated');
    assert.ok(reactEvent, 'Client received reaction_updated SSE event');

    req.destroy();
  });

  test('Teardown test server', async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
