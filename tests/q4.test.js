'use strict';

/**
 * tests/q4.test.js
 *
 * Tests for q4/getTotalUsageMB.js.
 *
 * Uses Node's built-in test runner (node:test) — no external libraries needed.
 * Run with:  node --test tests/q4.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getTotalUsageMB } = require('../q4/getTotalUsageMB');

// Helper: build a minimal record with only dataUsageMB set.
const rec = (mb) => ({ dataUsageMB: mb });

describe('getTotalUsageMB', () => {
  it('returns 0 for an empty array', () => {
    assert.equal(getTotalUsageMB([]), 0);
  });

  it('returns the value for a single record', () => {
    assert.equal(getTotalUsageMB([rec(500)]), 500);
  });

  it('sums two records (1500 + 1200 = 2700)', () => {
    assert.equal(getTotalUsageMB([rec(1500), rec(1200)]), 2700);
  });

  it('sums the full sample data set (1500 + 1200 + 6000 + 5800 + 500 + 9000 + 5000 + 700 = 29700)', () => {
    const records = [1500, 1200, 6000, 5800, 500, 9000, 5000, 700].map(rec);
    assert.equal(getTotalUsageMB(records), 29700);
  });
});
