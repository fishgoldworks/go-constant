'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');

function coverageFixture(t, files) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-coverage-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const checkout = path.join(temporary, '.tmp', 'checkout');

  for (const [name, source] of Object.entries({
    'src/used.js': 'module.exports = 42;',
    'test/entrypoints.test.js': "require('node:test')('entrypoint fixture', () => {});",
    'test/docs/documentation-examples.test.js': "require('node:test')('documentation fixture', () => {});",
    'test/coverage-fixture.test.js': "require('node:test')('loads the source', () => require('../src/used.js'));",
    ...files
  })) {
    const file = path.join(checkout, name);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }

  for (const name of [
    'package.json',
    'scripts/test.js',
    'scripts/test-execution-reporter.js',
    'scripts/cleanup.js',
    'scripts/coverage-inventory.js',
    'test/helpers/runtime-files.js'
  ]) {
    const target = path.join(checkout, name);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, name), target);
  }

  assert.ok(process.env.npm_execpath, 'Run with npm run test:tooling');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'coverage'], {
    cwd: checkout,
    encoding: 'utf8',
    timeout: 15000
  });

  assert.ifError(result.error);

  return result;
}

test('coverage rejects an unloaded maintained module even with 100% reported totals', (t) => {
  const result = coverageFixture(t, { 'src/unloaded.js': 'module.exports = 99;' });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Missing source coverage entry: src\/unloaded\.js/);
});

test('coverage measures nested source and excludes experiment directories inside the checkout', (t) => {
  const result = coverageFixture(t, {
    'src/nested/value.js': 'module.exports = 42;',
    'src/nested/temp/local.js': 'module.exports = 99;',
    'src/.tmp/local.js': 'module.exports = 99;',
    'src/used.js':
      "require('./nested/temp/local.js'); require('./.tmp/local.js'); module.exports = require('./nested/value.js');"
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bvalue\.js\s+\|/);
  assert.doesNotMatch(result.stdout, /\blocal\.js\s+\|/);
});
