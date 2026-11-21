'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

// Node can pass a synthetic file test after zero callbacks or process.exit(0).
// Only worker summaries establish that a selected file finished its own tests.
module.exports = async function* testExecutionReporter(events) {
  let declared = 0;
  let filteredFiles = 0;
  let executed = 0;
  let final;

  for await (const event of events) {
    if (event.type !== 'test:summary') continue;
    const summary = event.data;

    if (summary.file) {
      const passed = summary.counts.passed;
      const tests = summary.counts.tests;

      assert.ok(Number.isSafeInteger(passed) && passed >= 0, 'Invalid completed-test count');
      assert.ok(Number.isSafeInteger(tests) && tests >= 0, 'Invalid declared-test count');
      executed += passed;
      declared += tests;
      if (tests === 0) filteredFiles++;
    } else {
      final = summary;
    }
  }

  // Preserve the original test failure rather than adding a secondary error.
  if (!final || final.success !== true) {
    return;
  }

  // Node adds one synthetic result for each file with zero matched cases.
  // A completed zero-case worker accounts for that result. Any excess comes
  // from an unfinished/empty file, including extra positionals in a shard.
  // Totals avoid mistaking imported callbacks for entry-file events.
  if (final.counts.tests !== declared + filteredFiles) {
    throw new Error('Test file did not complete: unaccounted synthetic file result.');
  }

  if (executed === 0) {
    throw new Error('No active test callbacks completed; check name filters and skips.');
  }

  fs.writeFileSync(process.env.GO_CONSTANT_TEST_RESULT, JSON.stringify({ completed: true, executed }));
  yield '';
};
