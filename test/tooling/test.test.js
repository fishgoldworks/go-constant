'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '../..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-test-runner-'));
  const write = (file, contents) => {
    const target = path.join(root, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };

  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('go-constant-test-runner-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const file of [
    'package.json',
    'scripts/test.js',
    'scripts/test-execution-reporter.js',
    'scripts/cleanup.js',
    'scripts/coverage-inventory.js',
    'test/helpers/runtime-files.js'
  ]) {
    if (fs.existsSync(path.join(repository, file))) write(file, fs.readFileSync(path.join(repository, file)));
  }

  write('src/used.js', 'module.exports = 42;\n');
  write(
    'test/core.test.js',
    'const {test}=require("node:test"); test("selected core",()=>{' +
      'require("node:assert/strict").equal(require("../src/used"),42);' +
      'require("node:fs").writeFileSync(require("node:path").join(__dirname,"../executed"),"yes");});\n'
  );
  write('test/entrypoints.test.js', 'require("node:test")("entrypoint fixture",()=>{});\n');
  write('test/docs/documentation-examples.test.js', 'require("node:test")("documentation fixture",()=>{});\n');

  return {
    root,
    write,
    run(args = [], env = {}) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/test.js'), ...args], {
        cwd: os.tmpdir(),
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 15000
      });

      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stdout + result.stderr);

      return result;
    }
  };
}

test('the runner executes its selected callback from a nested Node test worker', (t) => {
  const f = fixture(t);
  const result = f.run(['--test-name-pattern', 'selected core', '--test-reporter=tap']);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'executed'), 'utf8'), 'yes');
  assert.match(result.stdout, /selected core/);
  assert.doesNotMatch(result.stderr, /called recursively/);
});

test('empty ordinary discovery fails before auxiliary cases can hide it', (t) => {
  const f = fixture(t);

  fs.unlinkSync(path.join(f.root, 'test/core.test.js'));
  const result = f.run();

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No core runtime test files/);
});

test('a supported filter matching no callback fails rather than counting synthetic file passes', (t) => {
  const f = fixture(t);
  const result = f.run(['--test-name-pattern=__no_match__']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No active test callbacks completed/);
  assert.equal(fs.existsSync(path.join(f.root, 'executed')), false);
});

for (const [name, source] of [
  ['module loading', 'process.exit(0);'],
  ['a test callback', 'require("node:test")("early",()=>process.exit(0));'],
  ['root cleanup', 'const {test,after}=require("node:test");test("early",()=>{});after(()=>process.exit(0));'],
  ['a file without declared tests', 'const value = 42; void value;']
]) {
  test('a missing file completion fails after ' + name, (t) => {
    const f = fixture(t);

    f.write('test/core.test.js', source);
    const result = f.run();

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Test file did not complete/);
  });
}

test('explicit optional skips remain visible alongside executed cases', (t) => {
  const f = fixture(t);

  f.write('test/optional.test.js', 'require("node:test")("optional fixture",{skip:"capability absent"},()=>{});');
  const result = f.run(['--test-reporter=tap']);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /SKIP capability absent/);
  assert.equal(fs.existsSync(path.join(f.root, 'executed')), true);
});

test('split reporter options and a file destination retain their output', (t) => {
  const f = fixture(t);
  const report = path.join(f.root, 'report.tap');
  const result = f.run(['--test-reporter', 'tap', '--test-reporter-destination', report]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(fs.readFileSync(report, 'utf8'), /selected core/);
  assert.doesNotMatch(result.stdout, /TAP version/);
});

test('a destination without a reporter retains the native argument rejection', (t) => {
  const f = fixture(t);
  const report = path.join(f.root, 'default-report.txt');
  const result = f.run(['--test-reporter-destination=' + report]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test-reporter/);
});

test('multiple reporters keep matching destinations', (t) => {
  const f = fixture(t);
  const report = path.join(f.root, 'report.xml');
  const result = f.run([
    '--test-reporter=tap',
    '--test-reporter=junit',
    '--test-reporter-destination=stdout',
    '--test-reporter-destination=' + report
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /selected core/);
  assert.match(fs.readFileSync(report, 'utf8'), /testsuites/);
});

test('assertion failures and invalid Node flags retain failure diagnostics', (t) => {
  const f = fixture(t);

  f.write('test/core.test.js', 'require("node:test")("failure",()=>{throw Error("original assertion");});');
  const failed = f.run();
  const invalid = f.run(['--not-a-node-test-option']);

  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /original assertion/);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /not-a-node-test-option/);
});

test('the maintained completion gate clearly rejects non-isolated mode', (t) => {
  const f = fixture(t);
  const result = f.run(['--test-isolation=none']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires process isolation/);
});

test('additional positional files and the option terminator retain native execution', (t) => {
  const f = fixture(t);

  f.write('extra.test.js', 'require("node:test")("extra positional",()=>{});');
  for (const args of [['extra.test.js'], ['--'], ['--', 'extra.test.js']]) {
    const result = f.run(args);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(path.join(f.root, 'executed')), true);
  }

  f.write('extra.test.js', 'process.exit(0);');
  const early = f.run(['extra.test.js']);

  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /Test file did not complete/);
});

test('native shards require only their selected files and still reject early exits', (t) => {
  const f = fixture(t);

  for (const shard of ['1/2', '2/2']) {
    const result = f.run(['--test-shard=' + shard]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  }

  for (const file of ['test/core.test.js', 'test/entrypoints.test.js', 'test/docs/documentation-examples.test.js']) {
    f.write(file, 'process.exit(0);');
  }

  const early = f.run(['--test-shard=1/2']);

  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /Test file did not complete/);
});

test('inherited reporter options preserve output, destinations and unrelated preloads', (t) => {
  const f = fixture(t);
  const preload = path.join(f.root, 'preload with spaces.cjs');
  const marker = path.join(f.root, 'preloaded');

  f.write('preload with spaces.cjs', 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"yes");');
  const flags = '--require ' + JSON.stringify(preload) + ' --test-reporter=tap';
  const inherited = f.run([], { NODE_OPTIONS: flags });

  assert.equal(inherited.status, 0, inherited.stdout + inherited.stderr);
  assert.match(inherited.stdout, /^TAP version/m);
  assert.doesNotMatch(inherited.stdout, /✔/);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'yes');

  const tap = path.join(f.root, 'inherited.tap');
  const xml = path.join(f.root, 'cli.xml');
  const file = f.run([], { NODE_OPTIONS: flags + ' --test-reporter-destination=' + JSON.stringify(tap) });

  assert.equal(file.status, 0, file.stdout + file.stderr);
  assert.equal(file.stdout, '');
  assert.match(fs.readFileSync(tap, 'utf8'), /selected core/);

  const mixed = f.run(
    ['--test-reporter=junit', '--test-reporter-destination=' + tap, '--test-reporter-destination=' + xml],
    { NODE_OPTIONS: flags }
  );

  assert.equal(mixed.status, 0, mixed.stdout + mixed.stderr);
  assert.equal(mixed.stdout, '');
  assert.match(fs.readFileSync(tap, 'utf8'), /selected core/);
  assert.match(fs.readFileSync(xml, 'utf8'), /testsuites/);
});

test('imported callbacks with file-like names are not mistaken for unfinished entry files', (t) => {
  const f = fixture(t);

  f.write('test/helper.cjs', 'require("node:test")(__filename,()=>{});');
  f.write('test/core.test.js', 'require("./helper.cjs");require("node:test")("core",()=>{});');
  const result = f.run();

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
