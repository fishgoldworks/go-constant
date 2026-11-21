'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const runtime = require('../test/helpers/runtime-files.js');
const assertCoverageInventory = require('./coverage-inventory.js');
const runCleanups = require('./cleanup.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const coverage = args[0] === '--coverage';
const options = coverage
  ? [
      '--test-reporter=tap',
      '--experimental-test-coverage',
      '--test-coverage-include=src/**',
      '--test-coverage-exclude=src/**/temp/**',
      '--test-coverage-exclude=src/**/.tmp/**',
      '--test-coverage-lines=100',
      '--test-coverage-branches=100',
      '--test-coverage-functions=100',
      ...args.slice(1)
    ]
  : args;

// Preserve raw tokens for unrelated flags, including quoted preload paths.
// Node's NODE_OPTIONS syntax uses double quotes and escapes inside quotes.
function inheritedReporters(value = '') {
  const tokens = [];
  let start = -1;
  let quoted = false;
  let decoded = '';

  for (let index = 0; index <= value.length; index++) {
    const character = value[index];

    if (index === value.length || (!quoted && /\s/.test(character))) {
      if (start !== -1) tokens.push({ raw: value.slice(start, index), value: decoded });
      start = -1;
      decoded = '';
    } else {
      if (start === -1) start = index;
      if (character === '"') quoted = !quoted;
      else if (character === '\\' && quoted) decoded += value[++index];
      else decoded += character;
    }
  }

  const retained = [];
  const reporters = [];

  for (let index = 0; index < tokens.length; index++) {
    const match = /^(--test[-_]reporter(?:[-_]destination)?)(?:=(.*))?$/.exec(tokens[index].value);

    if (match) {
      const setting = match[2] === undefined ? tokens[++index]?.value : match[2];

      if (setting === undefined) throw new Error('Missing NODE_OPTIONS value for ' + match[1]);
      reporters.push(match[1] + '=' + setting);
    } else {
      retained.push(tokens[index].raw);
    }
  }

  return { retained: retained.join(' '), reporters };
}

function main() {
  const inherited = inheritedReporters(process.env.NODE_OPTIONS);
  const effective = [...inherited.reporters, ...options];
  let isolation;

  for (let index = 0; index < effective.length; index++) {
    const match = /^--(?:experimental[-_])?test[-_]isolation(?:=(.*))?$/.exec(effective[index]);

    if (match) isolation = match[1] === undefined ? effective[index + 1] : match[1];
  }

  if (isolation === 'none') {
    throw new Error('The maintained test runner requires process isolation to verify per-file completion.');
  }

  const reporters = effective.filter((value) => /^--test[-_]reporter(?:=|$)/.test(value)).length;
  const destinations = effective.filter((value) => /^--test[-_]reporter[-_]destination(?:=|$)/.test(value)).length;
  const defaults = [];

  if (reporters === 0 && destinations === 0) {
    const modernDefault = Number(process.versions.node.split('.')[0]) >= 23;

    defaults.push('--test-reporter=' + (modernDefault || process.stdout.isTTY ? 'spec' : 'tap'));
  }

  if (destinations === 0 && reporters <= 1) defaults.push('--test-reporter-destination=stdout');
  const observer = [
    '--test-reporter=' + pathToFileURL(path.join(__dirname, 'test-execution-reporter.js')).href,
    '--test-reporter-destination=stdout'
  ];
  const files = [...runtime, 'test/entrypoints.test.js', 'test/docs/documentation-examples.test.js'];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-test-result-'));
  const resultFile = path.join(directory, 'completed.json');
  const env = {
    ...process.env,
    NODE_OPTIONS: inherited.retained,
    GO_CONSTANT_TEST_RESULT: resultFile
  };

  delete env.NODE_TEST_CONTEXT;
  const failures = [];
  let status = 0;

  try {
    const result = spawnSync(
      process.execPath,
      ['--test', ...observer, ...inherited.reporters, ...defaults, ...options, ...files],
      {
        cwd: root,
        env,
        stdio: coverage ? ['inherit', 'pipe', 'inherit'] : 'inherit',
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      }
    );

    if (result.error) throw result.error;
    status = result.status ?? 1;

    if (coverage) process.stdout.write(result.stdout);
    if (status !== 0) {
      failures.push(new Error('Runtime test process failed (' + (result.signal || status) + ').'));
    } else {
      if (!fs.existsSync(resultFile)) throw new Error('Test execution did not produce a completion record.');
      const completed = JSON.parse(fs.readFileSync(resultFile, 'utf8'));

      if (completed.completed !== true || !Number.isSafeInteger(completed.executed) || completed.executed <= 0) {
        throw new Error('Invalid test completion record.');
      }

      if (coverage) assertCoverageInventory(root, result.stdout);
    }
  } catch (error) {
    failures.push(error);
    if (status === 0) status = 1;
  }

  process.exitCode = status;
  runCleanups([() => fs.rmSync(directory, { recursive: true, force: true })], failures);
}

try {
  main();
} catch (error) {
  console.error(error);
  if (!process.exitCode) process.exitCode = 1;
}
