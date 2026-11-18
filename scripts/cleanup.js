'use strict';

/**
 * scripts/cleanup.js
 *
 * Deletes CSV snapshot files older than RETENTION_DAYS days from SNAPSHOT_DIR.
 * Age is determined from the date encoded in the filename, not file mtime.
 *
 * Environment variables:
 *   SNAPSHOT_DIR    Directory containing snapshot files  (default: ./snapshots)
 *   RETENTION_DAYS  Number of days to keep              (default: 30)
 *
 * Flags:
 *   --dry-run   List files that would be deleted without actually deleting them
 *
 * Usage:
 *   node scripts/cleanup.js
 *   node scripts/cleanup.js --dry-run
 */

const fs   = require('node:fs');
const path = require('node:path');

const SNAPSHOT_DIR    = process.env.SNAPSHOT_DIR    || './snapshots';
const RETENTION_DAYS  = parseInt(process.env.RETENTION_DAYS || '30', 10);
const dryRun          = process.argv.includes('--dry-run');

// Matches: usage_snapshot_YYYYMMDD_HHmm_WIB.csv
// Capture group 1 → YYYYMMDD (the date portion in WIB)
const SNAPSHOT_PATTERN = /^usage_snapshot_(\d{8})_\d{4}_WIB\.csv$/;

/**
 * Parses the date from a snapshot filename.
 * Returns a Date (midnight UTC of that calendar date) or null if the
 * filename does not match the expected pattern.
 */
function parseDateFromFilename(filename) {
  const match = SNAPSHOT_PATTERN.exec(filename);
  if (!match) return null;

  const dateStr = match[1]; // e.g. "20261116"
  const year  = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1; // 0-based
  const day   = parseInt(dateStr.slice(6, 8), 10);

  const d = new Date(Date.UTC(year, month, day));
  // Validate — catches impossible dates like month 13
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Returns true if the file should be deleted:
 *   - its filename matches the snapshot pattern, AND
 *   - the date encoded in the filename is older than retentionDays days ago
 *
 * @param {string} filename
 * @param {Date}   now              - reference "today" (injectable for tests)
 * @param {number} [retentionDays]  - override the module-level default (for tests)
 */
function shouldDelete(filename, now, retentionDays = RETENTION_DAYS) {
  const fileDate = parseDateFromFilename(filename);
  if (!fileDate) return false; // not a snapshot file — leave it alone

  // Compare at day granularity: strip the time component from "now"
  const todayMidnightUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  const ageMs   = todayMidnightUtc - fileDate;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return ageDays > retentionDays;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const dir = path.resolve(SNAPSHOT_DIR);

  // If the directory does not exist, there is nothing to clean up.
  if (!fs.existsSync(dir)) {
    console.log(`[cleanup] Directory not found: ${dir} — nothing to do.`);
    process.exit(0);
  }

  const files = fs.readdirSync(dir);
  const now   = new Date();
  let deletedCount = 0;

  for (const file of files) {
    if (!shouldDelete(file, now)) continue;

    const filePath = path.join(dir, file);

    if (dryRun) {
      console.log(`[cleanup] DRY-RUN would delete: ${filePath}`);
    } else {
      fs.unlinkSync(filePath);
      console.log(`[cleanup] Deleted: ${filePath}`);
    }
    deletedCount++;
  }

  const action = dryRun ? 'would delete' : 'deleted';
  console.log(`[cleanup] Done — ${action} ${deletedCount} file(s).`);
  process.exit(0);
}

// Only run main() when executed directly (not when require()'d by tests).
if (require.main === module) {
  main();
}

// Export helpers for the test suite.
module.exports = { parseDateFromFilename, shouldDelete };
