'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const packedFixture = require('../helpers/packed-fixture');
const root = path.resolve(__dirname, '../..');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-browser-harness-'));

  t.after(() => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package/package.json'), 'utf8'));

  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify(metadata));
  fs.cpSync(path.join(root, 'package/dist'), path.join(temporary, 'dist'), { recursive: true });
  const url = 'https://cdn.jsdelivr.net/npm/' + metadata.name + '@' + metadata.version + '/dist/go-constant.min.js';
  const readme =
    '<!-- browser-distribution-example -->\n```html\n' +
    '<script src="' +
    url +
    '"></script>\n' +
    '<script>\nconsole.log(goConstant(42, "Answer").valueOf()); // => 42\n</script>\n```\n';

  fs.writeFileSync(path.join(temporary, 'README.md'), readme);

  return { temporary, readme, url };
}

function checkReadme(directory) {
  const env = { ...process.env, BROWSER_PACKAGE: directory };

  delete env.NODE_TEST_CONTEXT;
  // README identity is checked before the loader tests; browser installation is unnecessary here.
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-name-pattern=loader contracts', 'test/browser/distribution.test.js'],
    { cwd: root, env, encoding: 'utf8', timeout: 30000, windowsHide: true }
  );

  assert.ifError(result.error);

  return { status: result.status, output: result.stdout + result.stderr };
}

test('browser harness accepts the exact candidate CDN URL', (t) => {
  const { temporary } = fixture(t);
  const result = checkReadme(temporary);

  assert.equal(result.status, 0, result.output);
});

test('browser harness rejects another package, version, host or bundle URL', (t) => {
  const { temporary, readme, url } = fixture(t);

  for (const replacement of [
    url.replace('@', '-other@'),
    url.replace(/@[^/]+\//, '@0.0.0/'),
    url.replace(/@[^/]+\//, '@latest/'),
    url.replace('cdn.jsdelivr.net', 'example.invalid'),
    url.replace('.min.js', '.missing.js')
  ]) {
    fs.writeFileSync(path.join(temporary, 'README.md'), readme.replace(url, replacement));
    const result = checkReadme(temporary);

    assert.notEqual(result.status, 0, 'Wrong CDN URL was accepted: ' + replacement);
    assert.match(result.output, /README example must load the exact candidate browser bundle/);
  }
});

test('browser harness rejects additional untested HTML examples', (t) => {
  const { temporary, readme } = fixture(t);

  fs.writeFileSync(
    path.join(temporary, 'README.md'),
    readme + '\n```html\n<script>throw Error("untested")</script>\n```\n'
  );
  const result = checkReadme(temporary);

  assert.notEqual(result.status, 0, 'Additional HTML example was silently ignored');
  assert.match(result.output, /README must have one maintained script-tag example/);
});

test('browser harness rejects an extra external script with other attributes', (t) => {
  const { temporary, readme } = fixture(t);

  fs.writeFileSync(
    path.join(temporary, 'README.md'),
    readme.replace('</script>', '</script>\n<script defer src="https://example.invalid/older.js"></script>')
  );
  const result = checkReadme(temporary);

  assert.notEqual(result.status, 0, 'An extra external script must not replace the candidate global');
  assert.match(result.output, /README example must load the exact candidate browser bundle/);
});

test('browser harness requires a documented console result', (t) => {
  const { temporary, readme } = fixture(t);

  fs.writeFileSync(path.join(temporary, 'README.md'), readme.replace(' // => 42', ''));
  const result = checkReadme(temporary);

  assert.notEqual(result.status, 0, 'The console output cannot be checked without its documented result');
  assert.match(result.output, /README example needs an annotated console result/);
});

test('browser runner rejects a missing supplied archive without falling back to the working package', (t) => {
  const { temporary } = fixture(t);
  const marker = path.join(temporary, 'npm-invoked');
  const npm = path.join(temporary, 'npm.js');

  fs.writeFileSync(npm, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "called");');
  const result = spawnSync(
    process.execPath,
    ['scripts/test-browser.js', '--tarball', path.join(temporary, 'missing.tgz')],
    {
      cwd: root,
      env: { ...process.env, npm_execpath: npm },
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    }
  );

  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tarball is missing/);
  assert.equal(fs.existsSync(marker), false);
});

test('browser runner rejects an invalid checksum before invoking npm', (t) => {
  const { temporary } = fixture(t);
  const archive = path.join(temporary, 'candidate.tgz');
  const npm = path.join(temporary, 'npm.js');
  const marker = path.join(temporary, 'npm-invoked');

  fs.writeFileSync(archive, packedFixture().bytes);
  fs.writeFileSync(archive + '.sha256', '0'.repeat(64) + '\n');
  fs.writeFileSync(npm, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "called");');
  const result = spawnSync(process.execPath, ['scripts/test-browser.js', '--tarball', archive], {
    cwd: root,
    env: { ...process.env, npm_execpath: npm },
    encoding: 'utf8',
    timeout: 10000
  });

  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tarball SHA-256 mismatch/);
  assert.equal(fs.existsSync(marker), false);
});

test('browser runner rejects changed archive bytes after its browser check', (t) => {
  const { temporary } = fixture(t);
  const archive = path.join(temporary, 'candidate.tgz');
  const consumer = path.join(temporary, 'consumer');
  const source = fs.readFileSync(path.join(root, 'scripts/test-browser.js'), 'utf8');
  const { bytes } = packedFixture();

  fs.writeFileSync(archive, bytes);
  fs.mkdirSync(consumer);
  const modules = {
    'node:assert/strict': assert,
    'node:fs': { ...fs, mkdtempSync: () => consumer },
    'node:path': path,
    'node:os': os,
    '../package.json': require('../../package.json'),
    './package-file': require('../../scripts/package-file'),
    './cleanup': require('../../scripts/cleanup'),
    'node:child_process': {
      spawnSync(_executable, args) {
        if (args[0] === '--test') {
          const changed = Buffer.from(bytes);

          // Change gzip header metadata while retaining the same tar payload.
          changed[4] ^= 1;
          fs.writeFileSync(archive, changed);
        } else {
          const installed = path.join(consumer, 'node_modules/go-constant');

          assert.equal(args.at(-1), archive);
          fs.mkdirSync(installed, { recursive: true });
          fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"go-constant"}');
        }

        return { status: 0 };
      }
    }
  };

  assert.throws(
    () =>
      runInNewContext(source, {
        require: (name) => modules[name],
        __dirname: path.join(root, 'scripts'),
        process: {
          execPath: process.execPath,
          argv: ['node', 'test-browser.js', '--tarball', archive],
          env: { npm_execpath: 'npm-cli.js' }
        }
      }),
    /Candidate changed during browser verification/
  );
  assert.equal(fs.existsSync(consumer), false);
});
