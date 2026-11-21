'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const entrySource = 'module.exports = value => ({ value, name: null });\n';

function fixture(run) {
  const prefix = path.join(os.tmpdir(), 'go-constant-benchmark-test-');
  const directory = fs.mkdtempSync(prefix);

  try {
    run(directory);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)), 'Cleanup must stay in the owned fixture');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function write(directory, name, source) {
  const destination = path.join(directory, name);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source);

  return destination;
}

function run(directory, location, environment = {}, args = []) {
  const output = path.join(directory, 'report.json');
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/benchmark.js'), location, output, '1', '1', ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, BENCH_CASES: 'constant-factory', BENCH_TIMEOUT_MS: '10000', ...environment }
    }
  );

  assert.ifError(result.error);

  return { ...result, output };
}

function checkReport(result, entry, sourceName, source = entrySource) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(fs.readFileSync(result.output, 'utf8'));

  assert.equal(report.libraries.baseline.entry, entry);
  assert.equal(report.sourceSHA256.baseline[sourceName], createHash('sha256').update(source).digest('hex'));
  assert.equal(report.runs.length, 2);
  assert.deepEqual(
    report.runs.map((run) => run.variant),
    ['baseline', 'optimized']
  );
  assert.ok(report.runs.every((run) => run.case === 'constant-factory' && run.samplesNs.length === 1));
  assert.equal(report.summary[0].case, 'constant-factory');
  assert.equal(report.summary[0].status, 'ok');

  return report;
}

test('benchmark honours main in a directory beside a colliding package.json', () =>
  fixture((directory) => {
    write(directory, 'package.json', '{"version":"1.0.0"}');
    write(directory, 'package/package.json', '{"main":"lib/constant.cjs","version":"9.8.7"}');
    write(directory, 'package/index.js', 'throw Error("The declared main must win");');
    const entry = write(directory, 'package/lib/constant.cjs', entrySource);
    const report = checkReport(run(directory, 'package'), entry, 'lib/constant.cjs');

    assert.equal(report.libraries.baseline.version, '9.8.7');
  }));

test('benchmark accepts an explicit file and attributes its loaded dependencies', () =>
  fixture((directory) => {
    const source = 'module.exports = require("./implementation.cjs");\n';
    const entry = write(directory, 'standalone.cjs', source);

    write(directory, 'implementation.cjs', entrySource);
    write(directory, 'unused.cjs', 'throw Error("Unused source must not be attributed");');
    const report = checkReport(run(directory, 'standalone.cjs'), entry, 'standalone.cjs', source);

    assert.deepEqual(Object.keys(report.sourceSHA256.baseline).sort(), ['implementation.cjs', 'standalone.cjs']);
    assert.equal(
      report.sourceSHA256.baseline['implementation.cjs'],
      createHash('sha256').update(entrySource).digest('hex')
    );
    assert.equal(report.libraries.baseline.version, null);
  }));

for (const [label, manifest] of [
  ['no metadata', null],
  ['no main', '{"version":"9.8.6"}'],
  ['a missing main', '{"main":"absent.js","version":"9.8.6"}']
]) {
  test('benchmark uses the index fallback with ' + label, () =>
    fixture((directory) => {
      if (manifest) write(directory, 'package/package.json', manifest);
      const entry = write(directory, 'package/index.js', entrySource);

      checkReport(run(directory, 'package'), entry, 'index.js');
    })
  );
}

test('benchmark keeps the supplied baseline and its source hashes', () =>
  fixture((directory) => {
    const baseline = path.join(root, 'benchmarks', 'baseline');
    const entry = path.join(baseline, 'index.js');
    const report = checkReport(run(directory, baseline), entry, 'index.js', fs.readFileSync(entry));

    assert.equal(
      report.libraries.baseline.version,
      null,
      'The archived baseline must not inherit the current repository version'
    );

    for (const filename of ['src/Constant.js', 'src/newType.js']) {
      assert.equal(
        report.sourceSHA256.baseline[filename],
        createHash('sha256')
          .update(fs.readFileSync(path.join(baseline, filename)))
          .digest('hex')
      );
    }
  }));

test('benchmark reports a declared entry failure instead of falling back to index', () =>
  fixture((directory) => {
    write(directory, 'package/package.json', '{"main":"entry.cjs"}');
    write(directory, 'package/index.js', entrySource);
    write(directory, 'package/entry.cjs', 'throw Error("Declared entry failed");');
    const result = run(directory, 'package');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Declared entry failed/);

    const report = JSON.parse(fs.readFileSync(result.output, 'utf8'));

    assert.equal(report.status, 'failed');
    assert.match(report.error, /Declared entry failed/);
  }));

test("benchmark preserves a worker's diagnostic and nonzero exit status", () =>
  fixture((directory) => {
    write(directory, 'entry.cjs', 'module.exports = () => { console.error("Worker diagnostic"); process.exit(7); };');
    const result = run(directory, 'entry.cjs');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Worker diagnostic/);
    assert.match(result.stderr, /exit status 7/);
    assert.match(result.stderr, /baseline.*constant-factory/);

    const report = JSON.parse(fs.readFileSync(result.output, 'utf8'));

    assert.equal(report.status, 'failed');
    assert.match(report.error, /Worker diagnostic/);
    assert.match(report.error, /exit status 7/);
  }));

test('benchmark replaces an earlier successful report when its first worker fails', () =>
  fixture((directory) => {
    const entry = write(directory, 'entry.cjs', entrySource);
    const initial = run(directory, 'entry.cjs');
    const complete = checkReport(initial, entry, 'entry.cjs');

    assert.equal(complete.status, 'complete');

    const failedSource = 'throw Error("Replacement worker failed");\n';

    write(directory, 'entry.cjs', failedSource);
    const result = run(directory, 'entry.cjs');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Replacement worker failed/);

    const report = JSON.parse(fs.readFileSync(result.output, 'utf8'));

    assert.equal(report.status, 'failed');
    assert.match(report.error, /Replacement worker failed/);
    assert.equal(report.libraries.baseline.entrySHA256, createHash('sha256').update(failedSource).digest('hex'));
    assert.deepEqual(report.runs, []);
    assert.deepEqual(report.summary, []);
  }));

test('benchmark distinguishes a bounded timeout from an unexpected worker failure', () =>
  fixture((directory) => {
    write(directory, 'entry.cjs', 'module.exports = () => { for (;;) {} };');
    const result = run(directory, 'entry.cjs', { BENCH_TIMEOUT_MS: '1000' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /baseline.*constant-factory.*timed out/);

    const report = JSON.parse(fs.readFileSync(result.output, 'utf8'));
    const timedOut = report.runs.find((run) => run.variant === 'baseline');

    assert.equal(timedOut.status, 'timeout');
    assert.equal(timedOut.medianNs, undefined);
    assert.equal(report.summary[0].status, 'timeout');
    assert.equal(report.summary[0].baselineNs, null);
    assert.equal(report.summary[0].speedup, null);
  }));

test('benchmark worker rejects inherited case names with an explicit diagnostic', () =>
  fixture((directory) => {
    const entry = write(directory, 'entry.cjs', entrySource);
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/benchmark-worker.js'), entry, 'toString', '1', '1'],
      {
        encoding: 'utf8',
        timeout: 10000
      }
    );

    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown benchmark: toString/);
  }));
