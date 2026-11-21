'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const packedFixture = require('../helpers/packed-fixture');
const root = path.resolve(__dirname, '../..');

test('package CLI reports the original consumer failure when cleanup also fails', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-cleanup-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const consumer = path.join(temporary, 'consumer');
  const archive = path.join(temporary, 'candidate.tgz');
  const preload = path.join(temporary, 'preload.cjs');
  const npm = path.join(temporary, 'npm.cjs');

  fs.mkdirSync(consumer);
  fs.writeFileSync(archive, packedFixture().bytes);
  fs.writeFileSync(
    preload,
    `const fs=require('node:fs');const old=fs.rmSync;fs.mkdtempSync=()=>${JSON.stringify(consumer)};fs.rmSync=(file,...args)=>{if(file===${JSON.stringify(consumer)})throw Error('CONSUMER_CLEANUP_FAILED');return old(file,...args);};`
  );
  fs.writeFileSync(
    npm,
    "const fs=require('node:fs');fs.mkdirSync('node_modules/go-constant',{recursive:true});fs.writeFileSync('node_modules/go-constant/package.json','{}');"
  );
  const result = spawnSync(process.execPath, ['--require', preload, 'scripts/test-package.js', '--tarball', archive], {
    cwd: root,
    env: { ...process.env, npm_execpath: npm },
    encoding: 'utf8',
    timeout: 10000
  });

  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Installed consumer manifest must match the canonical manifest/);
  assert.match(result.stderr, /CONSUMER_CLEANUP_FAILED/);
});

test('package checks reject absent candidates before invoking npm', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-no-pack-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const marker = path.join(temporary, 'npm-invoked');
  const fakeNpm = path.join(temporary, 'npm.js');

  fs.writeFileSync(fakeNpm, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "called");process.exit(7);`);
  for (const args of [[], ['--tarball', path.join(temporary, 'missing.tgz')]]) {
    const result = spawnSync(process.execPath, ['scripts/test-package.js', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm },
      timeout: 10000
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Supply --tarball|Release tarball is missing/);
    assert.equal(fs.existsSync(marker), false, 'consumer check must never create a replacement tarball');
  }
});

test('recorded candidate hash rejects changed tarball bytes', (t) => {
  const { readCandidate } = require('../../scripts/package-file.js');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-digest-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const filename = path.join(temporary, 'candidate.tgz');

  fs.writeFileSync(filename, packedFixture().bytes);
  const original = readCandidate(filename);

  fs.writeFileSync(filename + '.sha256', original.sha256 + '  candidate.tgz\n');

  assert.deepEqual(readCandidate(filename), original);

  fs.appendFileSync(filename, 'corruption');

  assert.throws(() => readCandidate(filename), /SHA-256 mismatch/);
});

test('release checks reject a candidate with stale runtime files even when the manifest matches', (t) => {
  const { packageRoot } = require('../../scripts/package-layout.js');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-stale-candidate-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

  const archive = path.join(temporary, 'candidate.tgz');
  const fakeNpm = path.join(temporary, 'npm.js');

  fs.writeFileSync(archive, packedFixture().bytes);
  fs.writeFileSync(
    fakeNpm,
    'const fs = require("node:fs");\n' +
      'const installed = "node_modules/go-constant";\n' +
      'fs.cpSync(' +
      JSON.stringify(packageRoot) +
      ', installed, { recursive: true });\n' +
      'fs.appendFileSync(installed + "/src/defineType.js", "\\n// Earlier build\\n");\n'
  );

  const result = spawnSync(
    process.execPath,
    ['scripts/test-package.js', '--tarball', archive, '--compare-package', packageRoot],
    { cwd: root, encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm }, timeout: 10000 }
  );

  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Candidate differs from the checked build: src\/defineType\.js/);
});

test('development root refuses packing and publication while generated metadata is standalone', (t) => {
  const npm = process.env.npm_execpath;

  assert.ok(npm, 'Run this test through npm.');

  const metadata = require('../../package.json');

  assert.equal(metadata.private, true);
  assert.equal(metadata.exports, undefined);

  const layout = require('../../scripts/package-layout');
  const generated = JSON.parse(fs.readFileSync(path.join(layout.packageRoot, 'package.json'), 'utf8'));

  assert.deepEqual(generated, layout.consumerManifest());

  for (const field of ['private', 'scripts', 'devDependencies', 'overrides']) assert.equal(generated[field], undefined);

  assert.deepEqual(layout.inventory(layout.packageRoot), [...layout.consumerFiles, 'package.json'].sort());

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'root-package-guard-'));

  t.after(() => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));

    fs.rmSync(temporary, { recursive: true, force: true });
  });
  for (const args of [
    ['pack', '--json', '--pack-destination', temporary],
    ['run', 'prepublishOnly']
  ]) {
    const result = spawnSync(process.execPath, [npm, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });

    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /development root is private/);
  }

  assert.deepEqual(fs.readdirSync(temporary), [], 'Wrong-directory packing must not produce an archive');
});

test('installed package checks reject changed consumer metadata and development fields', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-metadata-'));

  t.after(() => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));

    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const archive = path.join(temporary, 'candidate.tgz');

  fs.writeFileSync(archive, packedFixture().bytes);
  const fakeNpm = path.join(temporary, 'npm.js');
  const canonical = require('../../scripts/package-layout').consumerManifest();
  const reordered = JSON.parse(JSON.stringify(canonical.exports));

  reordered['.'][0].import = { default: './index.mjs', types: './index.d.mts' };
  for (const change of [
    { sideEffects: false },
    { unpkg: './missing.js' },
    { jsdelivr: './missing.js' },
    { exports: { '.': './missing.js' } },
    { exports: reordered },
    { types: './missing.d.ts' },
    { private: true },
    { scripts: { postinstall: 'unexpected' } },
    { devDependencies: { unexpected: '1.0.0' } }
  ]) {
    const metadata = { ...canonical, ...change };

    fs.writeFileSync(
      fakeNpm,
      'const fs=require("node:fs"); fs.mkdirSync("node_modules/go-constant",{recursive:true});' +
        'fs.writeFileSync("node_modules/go-constant/package.json",' +
        JSON.stringify(JSON.stringify(metadata)) +
        ');'
    );
    const result = spawnSync(process.execPath, ['scripts/test-package.js', '--tarball', archive], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm },
      timeout: 10000
    });

    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Installed consumer manifest must match the canonical manifest/);
  }
});

test('candidate preflight rejects invalid gzip and tar before npm starts', (t) => {
  const { gzipSync } = require('node:zlib');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-preflight-'));

  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, 'invalid.tgz');
  const npm = path.join(directory, 'npm.cjs');
  const marker = path.join(directory, 'npm-started');

  fs.writeFileSync(npm, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "called");');
  for (const bytes of [Buffer.from('plain text'), gzipSync('valid gzip, invalid tar')]) {
    fs.writeFileSync(archive, bytes);
    const result = spawnSync(process.execPath, ['scripts/test-package.js', '--tarball', archive], {
      cwd: root,
      env: { ...process.env, npm_execpath: npm },
      encoding: 'utf8',
      timeout: 10000
    });

    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not valid gzip|not a valid npm tarball/);
    assert.equal(fs.existsSync(marker), false);
  }
});

test('CI archive check requires the sidecar and confirms the producer digest', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-ci-check-'));

  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { name, version } = require('../../package.json');
  const archive = path.join(directory, 'artifacts', name + '-' + version + '.tgz');
  const output = path.join(directory, 'job-output');
  const runner = path.join(root, 'scripts/check-ci-candidate.js');
  const { bytes } = packedFixture();
  const digest = require('node:crypto').createHash('sha256').update(bytes).digest('hex');

  fs.mkdirSync(path.dirname(archive));
  fs.writeFileSync(archive, bytes);

  function check(...args) {
    const result = spawnSync(process.execPath, [runner, ...args], {
      cwd: directory,
      env: { ...process.env, GITHUB_OUTPUT: output },
      encoding: 'utf8',
      timeout: 10000
    });

    assert.ifError(result.error);

    return result;
  }

  let result = check(digest);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum sidecar is missing/);

  fs.writeFileSync(archive + '.sha256', digest + '  ' + path.basename(archive) + '\n');
  for (const expected of ['', '0'.repeat(64)]) {
    result = check(expected);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /producer SHA-256 digest/);
  }

  assert.equal(fs.existsSync(output), false);
  assert.equal(check().status, 0);
  assert.equal(check(digest).status, 0);
  const receipt = 'archive=' + archive + '\nsha256=' + digest + '\n';

  assert.equal(fs.readFileSync(output, 'utf8'), receipt + receipt);
});
