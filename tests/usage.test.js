'use strict';

/**
 * Tests for the subscriber-usage API.
 *
 * Uses Node's built-in test runner (node:test) and the global fetch API
 * (available in Node 18+). No external test libraries are required.
 *
 * Run with: node --test tests/usage.test.js
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, records } = require('../src/app');

// ---- Server lifecycle -------------------------------------------------------

let server;
let BASE_URL;

before((_, done) => {
  server = app.listen(0, () => { // port 0 → OS assigns a free port
    BASE_URL = `http://localhost:${server.address().port}/api/usage`;
    done();
  });
});

after((_, done) => {
  server.close(done);
});

// Reset store before every test so tests are independent
beforeEach(() => {
  records.length = 0;
  // Reset the auto-increment counter by re-requiring won't work in CommonJS cache,
  // so we patch the module-level counter indirectly: just clear records and
  // accept that IDs increment across the full test run (still unique).
});

// ---- Helpers ----------------------------------------------------------------

async function post(body) {
  return fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getAll(qs = '') {
  return fetch(`${BASE_URL}${qs ? '?' + qs : ''}`);
}

async function getBySub(subscriberId) {
  return fetch(`${BASE_URL}/${encodeURIComponent(subscriberId)}`);
}

// ---- Tests ------------------------------------------------------------------

describe('POST /api/usage', () => {
  it('creates a record and returns 201 with the full record', async () => {
    const payload = {
      subscriberId: 'sub-001',
      callMinutes: 10,
      smsCount: 5,
      dataUsageMB: 100.5,
    };

    const res = await post(payload);
    assert.equal(res.status, 201);

    const body = await res.json();
    assert.equal(body.subscriberId, 'sub-001');
    assert.equal(body.callMinutes, 10);
    assert.equal(body.smsCount, 5);
    assert.equal(body.dataUsageMB, 100.5);

    // Server-generated fields
    assert.ok(typeof body.id === 'number', 'id should be a number');
    assert.ok(body.id > 0, 'id should be positive');

    // timestamp must be a valid ISO 8601 UTC string
    const ts = new Date(body.timestamp);
    assert.ok(!isNaN(ts.getTime()), 'timestamp should be a valid date');
    assert.ok(body.timestamp.endsWith('Z'), 'timestamp should be UTC (ends with Z)');
  });

  it('auto-increments id across multiple records', async () => {
    const valid = { subscriberId: 'sub-x', callMinutes: 1, smsCount: 0, dataUsageMB: 0 };
    const r1 = await (await post(valid)).json();
    const r2 = await (await post(valid)).json();
    assert.ok(r2.id > r1.id, 'second record id should be greater than first');
  });
});

describe('POST /api/usage — validation failures', () => {
  it('returns 400 when subscriberId is missing', async () => {
    const res = await post({ callMinutes: 1, smsCount: 1, dataUsageMB: 1 });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(Array.isArray(body.errors));
    assert.ok(body.errors.some((e) => /subscriberId/.test(e)));
  });

  it('returns 400 when subscriberId is an empty string', async () => {
    const res = await post({ subscriberId: '  ', callMinutes: 1, smsCount: 1, dataUsageMB: 1 });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => /subscriberId/.test(e)));
  });

  it('returns 400 when callMinutes is negative', async () => {
    const res = await post({ subscriberId: 'sub-1', callMinutes: -1, smsCount: 1, dataUsageMB: 1 });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => /callMinutes/.test(e)));
  });

  it('returns 400 when smsCount is not a number', async () => {
    const res = await post({ subscriberId: 'sub-1', callMinutes: 1, smsCount: 'five', dataUsageMB: 1 });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => /smsCount/.test(e)));
  });

  it('returns 400 when dataUsageMB is Infinity', async () => {
    const res = await post({
      subscriberId: 'sub-1',
      callMinutes: 1,
      smsCount: 1,
      dataUsageMB: Infinity,       // JSON.stringify converts Infinity → null
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => /dataUsageMB/.test(e)));
  });

  it('returns all errors at once when multiple fields are invalid', async () => {
    const res = await post({ subscriberId: '', callMinutes: -1, smsCount: -2, dataUsageMB: -3 });
    assert.equal(res.status, 400);
    const body = await res.json();
    // All four fields are bad
    assert.ok(body.errors.length >= 4);
  });
});

describe('GET /api/usage', () => {
  it('returns empty list when no records exist', async () => {
    const res = await getAll();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 0);
    assert.deepEqual(body.data, []);
  });

  it('returns all records', async () => {
    await post({ subscriberId: 'sub-A', callMinutes: 1, smsCount: 0, dataUsageMB: 0 });
    await post({ subscriberId: 'sub-B', callMinutes: 2, smsCount: 0, dataUsageMB: 0 });

    const res = await getAll();
    const body = await res.json();
    assert.equal(body.count, 2);
    assert.equal(body.data.length, 2);
  });

  it('filters by subscriberId query param', async () => {
    await post({ subscriberId: 'sub-A', callMinutes: 1, smsCount: 0, dataUsageMB: 0 });
    await post({ subscriberId: 'sub-B', callMinutes: 2, smsCount: 0, dataUsageMB: 0 });
    await post({ subscriberId: 'sub-A', callMinutes: 3, smsCount: 0, dataUsageMB: 0 });

    const res = await getAll('subscriberId=sub-A');
    const body = await res.json();
    assert.equal(body.count, 2);
    assert.ok(body.data.every((r) => r.subscriberId === 'sub-A'));
  });

  it('returns empty list when filter matches no records', async () => {
    await post({ subscriberId: 'sub-A', callMinutes: 1, smsCount: 0, dataUsageMB: 0 });

    const res = await getAll('subscriberId=nobody');
    const body = await res.json();
    assert.equal(body.count, 0);
    assert.deepEqual(body.data, []);
  });
});

describe('GET /api/usage/:subscriberId', () => {
  it('returns records for a known subscriber', async () => {
    await post({ subscriberId: 'sub-C', callMinutes: 5, smsCount: 2, dataUsageMB: 50 });
    await post({ subscriberId: 'sub-C', callMinutes: 3, smsCount: 0, dataUsageMB: 10 });

    const res = await getBySub('sub-C');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 2);
    assert.ok(body.data.every((r) => r.subscriberId === 'sub-C'));
  });

  it('returns 404 when subscriber has no records', async () => {
    const res = await getBySub('ghost-subscriber');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(typeof body.error === 'string');
  });
});
