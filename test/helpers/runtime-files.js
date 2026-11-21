'use strict';

const fs = require('node:fs');
const path = require('node:path');
// One discovery rule for source, bundle, mutation, and installed-consumer runs.
// Integration tests have their own entry points; everything else is core runtime.
const integration = new Set(['build.test.js', 'artifacts.test.js', 'entrypoints.test.js']);

const files = fs
  .readdirSync(path.resolve(__dirname, '..'))
  .filter((name) => name.endsWith('.test.js') && !integration.has(name))
  .sort()
  .map((name) => `test/${name}`);

if (files.length === 0) {
  throw new Error('No core runtime test files found under test/.');
}

module.exports = files;
