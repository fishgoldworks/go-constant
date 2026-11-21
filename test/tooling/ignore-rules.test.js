'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('local experiments are excluded from lint, formatting and consumer files at every depth', async () => {
  const { ESLint } = require('eslint');
  const prettier = require('prettier');
  const eslint = new ESLint({ cwd: root });

  for (const name of [
    'temp/probe.js',
    '.tmp/probe.js',
    'src/temp/probe.js',
    'src/.tmp/probe.js',
    'test/temp/probe.js',
    'test/.tmp/probe.js'
  ]) {
    const filename = path.join(root, name);

    assert.equal(await eslint.isPathIgnored(filename), true, 'ESLint must ignore ' + name);
    assert.equal(
      (await prettier.getFileInfo(filename, { ignorePath: path.join(root, '.prettierignore') })).ignored,
      true,
      'Prettier must ignore ' + name
    );
  }

  const { consumerFiles } = require('../../scripts/package-layout.js');

  assert.equal(
    consumerFiles.some((name) => name.split('/').some((part) => part === 'temp' || part === '.tmp')),
    false
  );
});

test('lint scope distinguishes owned output from ordinary code', async () => {
  const { ESLint } = require('eslint');
  const prettier = require('prettier');
  const eslint = new ESLint({ cwd: root });

  for (const name of [
    'esm/probe.js',
    'es/probe.js',
    'vendor/probe.js',
    '.build-probe/probe.js',
    'src/probe.js',
    'test/package/probe.js'
  ]) {
    const filePath = path.join(root, name);
    const [invalid] = await eslint.lintText('module.exports = unboundScopeProbe;\n', { filePath });

    assert.equal(invalid.errorCount, 1, 'Invalid code must be checked in ' + name);
    assert.equal(invalid.warningCount, 0, 'The file must not be skipped: ' + name);
    assert.equal(invalid.messages[0].ruleId, 'no-undef', name);

    const [valid] = await eslint.lintText('module.exports = 42;\n', { filePath });

    assert.equal(valid.errorCount, 0, name);
    assert.equal(valid.warningCount, 0, name);
  }

  for (const name of [
    'package/probe.js',
    'artifacts/probe.js',
    'coverage/probe.js',
    '.package-probe/probe.js',
    '.package-backup-probe/probe.js',
    'benchmarks/baseline/src/probe.js',
    'docs/performance-history/probe.js'
  ]) {
    const filename = path.join(root, name);

    assert.equal(await eslint.isPathIgnored(filename), true, 'Owned output must stay excluded: ' + name);
    assert.equal(
      (await prettier.getFileInfo(filename, { ignorePath: path.join(root, '.prettierignore') })).ignored,
      true,
      'Formatting must keep excluding ' + name
    );
  }
});
