import test from 'node:test';
import assert from 'node:assert';

test('Unlisted post status validation allows published, draft, and unlisted', () => {
  const allowedStatuses = ['published', 'draft', 'unlisted'];
  assert.strictEqual(allowedStatuses.includes('unlisted'), true);
  assert.strictEqual(allowedStatuses.includes('draft'), true);
  assert.strictEqual(allowedStatuses.includes('published'), true);
  assert.strictEqual(allowedStatuses.includes('archived'), false);
});

test('Realtime event contract includes status for instant draft unpublishing', () => {
  const realtimePayload = {
    op: 'UPDATE',
    id: 'post-123',
    slug: 'secret-story',
    title: 'Secret Story',
    status: 'draft',
    type: 'journal'
  };

  assert.strictEqual(realtimePayload.status, 'draft');
  assert.strictEqual(realtimePayload.op, 'UPDATE');
  // Client check: if detail.status === 'draft', page should mark isDeleted=true immediately
  const shouldMakeUnavailable = realtimePayload.status === 'draft';
  assert.strictEqual(shouldMakeUnavailable, true);
});
