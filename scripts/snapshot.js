'use strict';

/**
 * scripts/snapshot.js
 *
 * Fetches subscriber usage data from the API and writes it as a CSV snapshot.
 *
 * Environment variables:
 *   API_URL       Base URL of the running API  (default: http://localhost:3000)
 *   SNAPSHOT_DIR  Directory to write CSV files (default: ./snapshots)
 *
 * Usage:
 *   node scripts/snapshot.js
 */

const fs   = require('node:fs');
const path = require('node:path');

const API_URL      = process.env.API_URL      || 'http://localhost:3000';
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || './snapshots';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current time broken into parts in Asia/Jakarta (WIB, UTC+7).
 * We use Intl.DateTimeFormat to avoid relying on the server's local timezone.
 */
function wibTimeParts(now = new Date()) {
  // formatToParts gives us individual numeric fields in the target timezone.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(now).map(({ type, value }) => [type, value])
  );

  return {
    year:   parts.year,
    month:  parts.month,
    day:    parts.day,
    hour:   parts.hour,   // 24-hour, zero-padded
    minute: parts.minute,
  };
}

/**
 * Returns the snapshot filename for a given Date.
 * Pattern: usage_snapshot_YYYYMMDD_HHmm_WIB.csv
 */
function buildFilename(now = new Date()) {
  const { year, month, day, hour, minute } = wibTimeParts(now);
  return `usage_snapshot_${year}${month}${day}_${hour}${minute}_WIB.csv`;
}

/**
 * Escapes a single CSV field value.
 * Wraps the value in double-quotes if it contains a comma, double-quote,
 * or newline, and doubles any embedded double-quotes.
 */
function escapeCsvField(value) {
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Converts an array of record objects to a CSV string.
 */
function toCsv(records) {
  const header = 'id,subscriberId,callMinutes,smsCount,dataUsageMB,timestamp';
  const rows = records.map((r) =>
    [r.id, r.subscriberId, r.callMinutes, r.smsCount, r.dataUsageMB, r.timestamp]
      .map(escapeCsvField)
      .join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch usage data from the API
  let response;
  try {
    response = await fetch(`${API_URL}/api/usage`);
  } catch (err) {
    console.error(`[snapshot] ERROR: Could not reach API at ${API_URL}: ${err.message}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`[snapshot] ERROR: API returned HTTP ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const payload = await response.json();
  const records = payload.data;

  if (records.length === 0) {
    console.log('[snapshot] No records returned from API — writing header-only CSV.');
  }

  // 2. Build file paths
  const now      = new Date();
  const filename = buildFilename(now);
  const dir      = path.resolve(SNAPSHOT_DIR);
  const finalPath = path.join(dir, filename);
  const tmpPath   = finalPath + '.tmp';

  // 3. Ensure the output directory exists
  fs.mkdirSync(dir, { recursive: true });

  // 4. Write atomically: write to .tmp, then rename
  const csvContent = toCsv(records);
  fs.writeFileSync(tmpPath, csvContent, 'utf8');
  fs.renameSync(tmpPath, finalPath);

  // 5. Report success
  // Row count excludes the header line
  const rowCount = records.length;
  console.log(`[snapshot] Saved ${rowCount} row(s) → ${finalPath}`);
}

// Only run main() when executed directly (not when require()'d by tests).
if (require.main === module) {
  main();
}

// Export helpers so the test suite can import them without running main().
module.exports = { buildFilename, wibTimeParts, escapeCsvField, toCsv };
