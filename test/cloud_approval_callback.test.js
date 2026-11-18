const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GITHUB_TOKEN = 'test-token';
const { handleCallbackData } = require('../tools/tradelab_cloud_agent');

test('old Telegram button cannot approve a candidate', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('legacy button must not make a request'); };
  try {
    assert.deepEqual(await handleCallbackData('approve:AVAXUSDT:1h:breakout'), { stale: true });
  } finally { global.fetch = originalFetch; }
});

test('only the current pending request can be approved', async () => {
  const originalFetch = global.fetch;
  const key = 'AVAXUSDT:1h:breakout';
  const requestId = '0123456789abcdef';
  const state = { [key]: { key, status: 'pending', requestId } };
  const writes = [];
  global.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      writes.push(JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString()));
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({ sha: 'sha', content: Buffer.from(JSON.stringify(state)).toString('base64') }), { status: 200 });
  };
  try {
    assert.deepEqual(await handleCallbackData(`approve:${key}|fedcba9876543210`), { stale: true });
    assert.equal(writes.length, 0);
    const result = await handleCallbackData(`approve:${key}|${requestId}`);
    assert.equal(result.saved, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][key].status, 'approved');
  } finally { global.fetch = originalFetch; }
});

