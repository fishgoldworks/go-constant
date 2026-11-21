'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readCandidate } = require('./package-file');
const runCleanups = require('./cleanup');
const root = path.resolve(__dirname, '..');
const name = require('../package.json').name;
const args = process.argv.slice(2);

if (args.length && (args.length !== 2 || !['--tarball', '--package'].includes(args[0])))
  throw Error('Usage: npm run test:browser -- [--tarball file | --package directory]');
const candidate = args[0] === '--tarball' ? readCandidate(args[1]) : null;
const errors = [];
let temporary;

try {
  let directory = path.resolve(args[0] === '--package' ? args[1] : path.join(root, 'package'));

  if (candidate) {
    assert.ok(process.env.npm_execpath, 'Run this check with npm run test:browser');
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), name + '-browser-'));
    fs.writeFileSync(
      path.join(temporary, 'package.json'),
      JSON.stringify({ name: 'browser-consumer', version: '1.0.0', private: true })
    );
    const install = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        candidate.tarball
      ],
      { cwd: temporary, encoding: 'utf8', timeout: 60000, windowsHide: true }
    );

    assert.ifError(install.error);
    assert.equal(install.status, 0, install.stdout + install.stderr);
    directory = path.join(temporary, 'node_modules', name);
  }

  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).name, name);
  const env = { ...process.env, BROWSER_PACKAGE: directory };

  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', 'test/browser/distribution.test.js'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Browser distribution tests failed: ' + result.status);

  if (candidate) {
    assert.equal(
      readCandidate(candidate.tarball).sha256,
      candidate.sha256,
      'Candidate changed during browser verification'
    );
  }
} catch (error) {
  errors.push(error);
}

runCleanups(temporary ? [() => fs.rmSync(temporary, { recursive: true, force: true })] : [], errors);
