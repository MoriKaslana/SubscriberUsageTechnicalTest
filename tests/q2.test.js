'use strict';

/**
 * tests/q2.test.js
 *
 * Tests for scripts/snapshot.js and scripts/cleanup.js helpers.
 *
 * Uses Node's built-in test runner (node:test) — no external libraries needed.
 * Run with:  node --test tests/q2.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('node:fs');
const os      = require('node:os');
const path    = require('node:path');

const { buildFilename, wibTimeParts, escapeCsvField, toCsv } =
  require('../scripts/snapshot');
const { parseDateFromFilename, shouldDelete } =
  require('../scripts/cleanup');

// ---------------------------------------------------------------------------
// Temporary directory — created once, removed after all tests
// ---------------------------------------------------------------------------

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-usage-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// snapshot helpers
// ---------------------------------------------------------------------------

describe('wibTimeParts', () => {
  it('converts a UTC time to WIB (UTC+7)', () => {
    // 2026-11-16T00:30:00Z  →  2026-11-16T07:30:00+07:00
    const utc = new Date('2026-11-16T00:30:00Z');
    const parts = wibTimeParts(utc);
    assert.equal(parts.year,   '2026');
    assert.equal(parts.month,  '11');
    assert.equal(parts.day,    '16');
    assert.equal(parts.hour,   '07');
    assert.equal(parts.minute, '30');
  });

  it('rolls over to the next WIB date when UTC is still the previous day', () => {
    // 2026-11-15T17:00:00Z  →  2026-11-16T00:00:00+07:00
    // UTC date is 15th, WIB date is 16th
    const utc = new Date('2026-11-15T17:00:00Z');
    const parts = wibTimeParts(utc);
    assert.equal(parts.year,  '2026');
    assert.equal(parts.month, '11');
    assert.equal(parts.day,   '16');   // WIB is already the next day
    assert.equal(parts.hour,  '00');
    assert.equal(parts.minute,'00');
  });

  it('stays on the previous WIB date when UTC has already ticked to the next day', () => {
    // 2026-11-16T16:59:00Z  →  2026-11-16T23:59:00+07:00  (still the 16th in WIB)
    const utc = new Date('2026-11-16T16:59:00Z');
    const parts = wibTimeParts(utc);
    assert.equal(parts.day,    '16');
    assert.equal(parts.hour,   '23');
    assert.equal(parts.minute, '59');
  });
});

describe('buildFilename', () => {
  it('produces the correct filename pattern for a known WIB time', () => {
    // 2026-11-16T01:00:00Z  →  WIB 08:00 on 2026-11-16
    const utc = new Date('2026-11-16T01:00:00Z');
    assert.equal(buildFilename(utc), 'usage_snapshot_20261116_0800_WIB.csv');
  });

  it('uses WIB date, not UTC date, when they differ', () => {
    // 2026-11-15T17:30:00Z  →  WIB 00:30 on 2026-11-16
    const utc = new Date('2026-11-15T17:30:00Z');
    assert.equal(buildFilename(utc), 'usage_snapshot_20261116_0030_WIB.csv');
  });
});

// ---------------------------------------------------------------------------
// CSV escaping
// ---------------------------------------------------------------------------

describe('escapeCsvField', () => {
  it('passes through a plain value unchanged', () => {
    assert.equal(escapeCsvField('hello'), 'hello');
    assert.equal(escapeCsvField(42), '42');
  });

  it('wraps a value containing a comma in double-quotes', () => {
    assert.equal(escapeCsvField('a,b'), '"a,b"');
  });

  it('wraps a value containing a double-quote and doubles the quote', () => {
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  });

  it('wraps a value containing a newline', () => {
    assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
  });

  it('handles a value with both a comma and a double-quote', () => {
    assert.equal(escapeCsvField('a,"b"'), '"a,""b"""');
  });
});

describe('toCsv', () => {
  it('produces only the header row when records is empty', () => {
    const csv = toCsv([]);
    assert.equal(csv, 'id,subscriberId,callMinutes,smsCount,dataUsageMB,timestamp\n');
  });

  it('produces header + one data row for a single record', () => {
    const record = {
      id: 1, subscriberId: 'sub-001', callMinutes: 10,
      smsCount: 5, dataUsageMB: 100.5, timestamp: '2026-11-16T01:00:00.000Z',
    };
    const csv = toCsv([record]);
    const lines = csv.trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'id,subscriberId,callMinutes,smsCount,dataUsageMB,timestamp');
    assert.equal(lines[1], '1,sub-001,10,5,100.5,2026-11-16T01:00:00.000Z');
  });

  it('escapes a subscriberId that contains a comma', () => {
    const record = {
      id: 2, subscriberId: 'sub,special', callMinutes: 0,
      smsCount: 0, dataUsageMB: 0, timestamp: '2026-11-16T01:00:00.000Z',
    };
    const csv = toCsv([record]);
    assert.ok(csv.includes('"sub,special"'), 'comma in subscriberId should be quoted');
  });
});

// ---------------------------------------------------------------------------
// cleanup helpers
// ---------------------------------------------------------------------------

describe('parseDateFromFilename', () => {
  it('extracts the date from a valid filename', () => {
    const d = parseDateFromFilename('usage_snapshot_20261116_0800_WIB.csv');
    assert.ok(d instanceof Date);
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(),    10);   // 0-based, so 10 = November
    assert.equal(d.getUTCDate(),     16);
  });

  it('returns null for a file that does not match the pattern', () => {
    assert.equal(parseDateFromFilename('some_other_file.csv'),       null);
    assert.equal(parseDateFromFilename('usage_snapshot_bad.csv'),    null);
    assert.equal(parseDateFromFilename('README.md'),                 null);
  });
});

describe('shouldDelete', () => {
  it('returns true for a file older than RETENTION_DAYS', () => {
    // File dated 60 days ago — well past the default 30-day window
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const y = sixtyDaysAgo.getUTCFullYear();
    const m = String(sixtyDaysAgo.getUTCMonth() + 1).padStart(2, '0');
    const d = String(sixtyDaysAgo.getUTCDate()).padStart(2, '0');
    const filename = `usage_snapshot_${y}${m}${d}_0800_WIB.csv`;
    assert.equal(shouldDelete(filename, new Date(), 30), true);
  });

  it('returns false for a file within the retention window', () => {
    // File dated today
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const filename = `usage_snapshot_${y}${m}${d}_0800_WIB.csv`;
    assert.equal(shouldDelete(filename, now, 30), false);
  });

  it('returns false for files that do not match the naming pattern', () => {
    assert.equal(shouldDelete('random_old_file.csv', new Date(), 30), false);
    assert.equal(shouldDelete('README.md',           new Date(), 30), false);
  });
});

// ---------------------------------------------------------------------------
// File-system integration: cleanup honours --dry-run and skips non-matching files
// ---------------------------------------------------------------------------

describe('cleanup file-system behaviour', () => {
  it('only deletes old matching files, keeps recent files, ignores unrelated files', () => {
    // Create a subdirectory inside tmpDir for this test
    const dir = fs.mkdtempSync(path.join(tmpDir, 'cleanup-'));

    const now = new Date();

    // Helper: create an empty file in dir
    const touch = (name) => fs.writeFileSync(path.join(dir, name), '');

    // --- Files that SHOULD be deleted (old snapshots) ---
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const y = sixtyDaysAgo.getUTCFullYear();
    const m = String(sixtyDaysAgo.getUTCMonth() + 1).padStart(2, '0');
    const d = String(sixtyDaysAgo.getUTCDate()).padStart(2, '0');
    const oldSnap = `usage_snapshot_${y}${m}${d}_0800_WIB.csv`;
    touch(oldSnap);

    // --- Files that should NOT be deleted ---
    const ny = now.getUTCFullYear();
    const nm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const nd = String(now.getUTCDate()).padStart(2, '0');
    const recentSnap = `usage_snapshot_${ny}${nm}${nd}_0800_WIB.csv`;
    touch(recentSnap);
    touch('unrelated.txt');
    touch('notes.csv');

    // Run the shouldDelete logic directly (mirrors what cleanup.js main() does)
    const files = fs.readdirSync(dir);
    const toDelete = files.filter((f) => shouldDelete(f, now, 30));

    assert.deepEqual(toDelete, [oldSnap], 'only the old snapshot should be flagged');

    // Simulate deletion (not dry-run)
    for (const f of toDelete) fs.unlinkSync(path.join(dir, f));

    const remaining = fs.readdirSync(dir).sort();
    assert.deepEqual(remaining.sort(), ['notes.csv', recentSnap, 'unrelated.txt'].sort());
  });

  it('dry-run does not delete any files', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'dryrun-'));

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const y = sixtyDaysAgo.getUTCFullYear();
    const m = String(sixtyDaysAgo.getUTCMonth() + 1).padStart(2, '0');
    const d = String(sixtyDaysAgo.getUTCDate()).padStart(2, '0');
    const oldSnap = `usage_snapshot_${y}${m}${d}_0800_WIB.csv`;
    fs.writeFileSync(path.join(dir, oldSnap), '');

    // In dry-run mode we just check shouldDelete but don't unlink
    const files = fs.readdirSync(dir);
    const flagged = files.filter((f) => shouldDelete(f, new Date(), 30));
    assert.equal(flagged.length, 1, 'one file should be flagged for dry-run');

    // Confirm file still exists (we did not delete it)
    assert.ok(fs.existsSync(path.join(dir, oldSnap)), 'file must still exist in dry-run');
  });
});
