'use strict';

// ---------------------------------------------------------------------------
// BUGGY ORIGINAL
//
// function getTotalUsageMB(records) {
//   return records.reduce((total, record) => {
//     total += record.dataUsageMB;
//   });
// }
// ---------------------------------------------------------------------------

/**
 * Returns the sum of dataUsageMB across all records.
 *
 * Two fixes applied vs. the buggy original:
 *   1. The arrow-function callback now returns the new accumulator value
 *      (expression body `total + record.dataUsageMB` instead of a block body
 *      with no `return` statement).
 *   2. An initial value of 0 is supplied as the second argument to .reduce(),
 *      so the accumulator starts as a number, the function behaves correctly
 *      on a single-element or empty array, and string-concatenation with the
 *      first record object is impossible.
 */
function getTotalUsageMB(records) {
  return records.reduce((total, record) => total + record.dataUsageMB, 0);
}

module.exports = { getTotalUsageMB };
