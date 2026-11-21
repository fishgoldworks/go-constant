'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function copyInputs(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-build-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const file of [
    'package.json',
    'scripts/README.template.md',
    'scripts/API.template.md',
    ...require('../scripts/package-layout').authoredFiles
  ]) {
    const destination = path.join(temporary, file);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }

  return temporary;
}

function mappedNames(map) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const result = [];
  let source = 0;
  let line = 0;
  let name = 0;

  for (const row of map.mappings.split(';')) {
    for (const segment of row.split(',').filter(Boolean)) {
      const fields = [];
      let value = 0;
      let shift = 0;

      for (const character of segment) {
        const digit = alphabet.indexOf(character);

        assert.ok(digit >= 0);
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else {
          fields.push(value & 1 ? -Math.floor(value / 2) : Math.floor(value / 2));
          value = 0;
          shift = 0;
        }
      }

      if (fields.length >= 4) {
        source += fields[1];
        line += fields[2];
        if (fields.length === 5) {
          name += fields[4];
          result.push({ name: map.names[name], source: map.sources[source], line });
        }
      }
    }
  }

  return result;
}

test('build creates both bundles and composed source maps from clean inputs', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });

  assert.deepEqual(fs.readdirSync(path.join(temporary, 'package/dist')).sort(), [
    'go-constant.js',
    'go-constant.js.map',
    'go-constant.min.js',
    'go-constant.min.js.map'
  ]);
  const readable = JSON.parse(fs.readFileSync(path.join(temporary, 'package/dist/go-constant.js.map')));
  const minified = JSON.parse(fs.readFileSync(path.join(temporary, 'package/dist/go-constant.min.js.map')));

  assert.deepEqual(minified.sources, readable.sources, 'Minification must compose the build map');
  assert.deepEqual(minified.sourcesContent, readable.sourcesContent);
  const names = mappedNames(minified);
  const lines = readable.sourcesContent[0].split('\n');

  for (const [name, pattern] of [
    ['Constant', /^\s*function Constant\b/],
    ['freeze', /return Object\.freeze\(enumeration\)/]
  ]) {
    const line = lines.findIndex((text) => pattern.test(text));

    assert.ok(line >= 0, name);
    assert.ok(
      names.some((entry) => entry.name === name && entry.line === line && entry.source === readable.sources[0]),
      name + ': composed mapping must reach its bundled source'
    );
  }

  await build({ root: temporary, check: true });
});

test('check mode detects stale artifacts without changing them', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const target = path.join(temporary, 'package/dist/go-constant.min.js');

  fs.writeFileSync(target, 'stale');
  await assert.rejects(build({ root: temporary, check: true }), /stale|out of date/i);

  assert.equal(fs.readFileSync(target, 'utf8'), 'stale');
});

test('missing output is detected, and a complete build repairs stale files', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await assert.rejects(build({ root: temporary, check: true }), /missing|stale|out of date/i);
  await build({ root: temporary });
  fs.writeFileSync(path.join(temporary, 'package/dist/obsolete.js'), 'obsolete');
  await assert.rejects(build({ root: temporary, check: true }), /unexpected|stale|out of date/i);
  await build({ root: temporary });

  assert.equal(fs.existsSync(path.join(temporary, 'package/dist/obsolete.js')), false);
});

test('invalid input fails before replacing previously valid artifacts', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const target = path.join(temporary, 'package/dist/go-constant.js');
  const before = fs.readFileSync(target, 'utf8');

  fs.writeFileSync(path.join(temporary, 'src/defineType.js'), 'function {');
  await assert.rejects(build({ root: temporary }));

  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('a fresh build is byte-for-byte repeatable', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const names = require('../scripts/package-layout').inventory(path.join(temporary, 'package'));
  const before = names.map((name) => fs.readFileSync(path.join(temporary, 'package', name), 'utf8'));

  await build({ root: temporary });
  const after = names.map((name) => fs.readFileSync(path.join(temporary, 'package', name), 'utf8'));

  assert.deepEqual(after, before);
});

function filesUnder(directory) {
  return require('../scripts/package-layout')
    .inventory(directory)
    .map((name) => [name, fs.readFileSync(path.join(directory, name), 'utf8')]);
}

test('a failed installation restores the previous complete distribution', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const destination = path.join(temporary, 'package');
  const before = filesUnder(destination);

  // Make the pending output distinct from the version being preserved.
  fs.appendFileSync(path.join(temporary, 'index.js'), '\n// new version\n');
  const installError = Object.assign(new Error('installation denied'), { code: 'EACCES' });
  const rename = fs.renameSync;

  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === destination && path.basename(source).startsWith('.package-')) throw installError;

    return rename(source, target);
  });
  await assert.rejects(build({ root: temporary }), (error) => error === installError);

  assert.equal(fs.existsSync(destination), true, 'previous distribution must not disappear');
  assert.deepEqual(filesUnder(destination), before);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    []
  );
});

test('a failed rollback retains the recoverable backup and reports both errors', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const destination = path.join(temporary, 'package');
  const before = filesUnder(destination);
  const installError = new Error('installation denied');
  const restoreError = new Error('rollback denied');
  const rename = fs.renameSync;

  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === destination) {
      if (path.basename(source).startsWith('.package-')) throw installError;
      throw restoreError;
    }

    return rename(source, target);
  });
  await assert.rejects(build({ root: temporary }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [installError, restoreError]);
    assert.match(error.message, /previous distribution.*\.package-backup-/i);

    return true;
  });
  const backups = fs.readdirSync(temporary).filter((name) => name.startsWith('.package-backup-'));

  assert.equal(backups.length, 1);
  assert.deepEqual(filesUnder(path.join(temporary, backups[0], 'package')), before);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    backups
  );
});

test('a failed first installation leaves no partial distribution or staging directory', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');
  const destination = path.join(temporary, 'package');
  const installError = new Error('installation denied');
  const rename = fs.renameSync;

  t.mock.method(fs, 'renameSync', (source, target) => {
    if (target === destination) throw installError;

    return rename(source, target);
  });
  await assert.rejects(build({ root: temporary }), (error) => error === installError);

  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    []
  );
});

test('a staging write failure leaves the old distribution untouched', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const destination = path.join(temporary, 'package');
  const before = filesUnder(destination);
  const write = fs.writeFileSync;
  const writeError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });

  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (path.basename(path.dirname(file)).startsWith('.package-')) throw writeError;

    return write(file, ...args);
  });
  await assert.rejects(build({ root: temporary }), (error) => error === writeError);

  assert.deepEqual(filesUnder(destination), before);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    []
  );
});

test('failure to move the old distribution leaves it intact', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const destination = path.join(temporary, 'package');
  const before = filesUnder(destination);
  const rename = fs.renameSync;
  const moveError = new Error('backup move denied');

  t.mock.method(fs, 'renameSync', (source, target) => {
    if (source === destination) throw moveError;

    return rename(source, target);
  });
  await assert.rejects(build({ root: temporary }), (error) => error === moveError);

  assert.deepEqual(filesUnder(destination), before);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    []
  );
});

test('valid JavaScript with broken exports cannot replace a working distribution', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const destination = path.join(temporary, 'package');
  const before = filesUnder(destination);

  fs.writeFileSync(path.join(temporary, 'index.js'), 'module.exports = null;');
  await assert.rejects(build({ root: temporary }));

  assert.deepEqual(filesUnder(destination), before);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
    []
  );
});

test('cleanup preserves the staging failure instead of replacing its diagnostic', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const before = filesUnder(path.join(temporary, 'package'));
  const writeError = new Error('disk full');
  const cleanupError = new Error('staging cleanup denied');
  const write = fs.writeFileSync,
    remove = fs.rmSync;

  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (path.basename(path.dirname(file)).startsWith('.package-')) throw writeError;

    return write(file, ...args);
  });
  t.mock.method(fs, 'rmSync', (file, ...args) => {
    if (path.dirname(file) === temporary && path.basename(file).startsWith('.package-')) throw cleanupError;

    return remove(file, ...args);
  });
  await assert.rejects(build({ root: temporary }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [writeError, cleanupError]);
    assert.match(error.message, /disk full/);

    return true;
  });

  assert.deepEqual(filesUnder(path.join(temporary, 'package')), before);
});

test('staging cleanup failure does not prevent cleanup of an obsolete backup', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const cleanupError = new Error('staging cleanup denied');
  const remove = fs.rmSync;

  t.mock.method(fs, 'rmSync', (file, ...args) => {
    if (
      path.dirname(file) === temporary &&
      path.basename(file).startsWith('.package-') &&
      !path.basename(file).startsWith('.package-backup-')
    )
      throw cleanupError;

    return remove(file, ...args);
  });
  await assert.rejects(build({ root: temporary }), (error) => error === cleanupError);

  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.package-backup-')),
    []
  );

  await build({ root: temporary, check: true });
});

for (const failure of [undefined, null, false, 0, '']) {
  test(
    'a falsy staging failure (' + String(failure) + ') preserves its value and the previous distribution',
    async (t) => {
      const temporary = copyInputs(t);
      const { build } = require('../scripts/build.js');

      await build({ root: temporary });
      const before = filesUnder(path.join(temporary, 'package'));
      const write = fs.writeFileSync;

      t.mock.method(fs, 'writeFileSync', (file, ...args) => {
        if (path.basename(path.dirname(file)).startsWith('.package-')) throw failure;

        return write(file, ...args);
      });
      await assert.rejects(build({ root: temporary }), (error) => error === failure);

      assert.deepEqual(filesUnder(path.join(temporary, 'package')), before);
      assert.deepEqual(
        fs.readdirSync(temporary).filter((name) => name.startsWith('.package-')),
        []
      );
    }
  );
}

test('cleanup failure retains a null build failure alongside the cleanup error', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const before = filesUnder(path.join(temporary, 'package'));
  const cleanupError = new Error('staging cleanup denied');
  const write = fs.writeFileSync,
    remove = fs.rmSync;

  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (path.basename(path.dirname(file)).startsWith('.package-')) throw null;

    return write(file, ...args);
  });
  t.mock.method(fs, 'rmSync', (file, ...args) => {
    if (path.dirname(file) === temporary && path.basename(file).startsWith('.package-')) throw cleanupError;

    return remove(file, ...args);
  });
  await assert.rejects(build({ root: temporary }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [null, cleanupError]);

    return true;
  });

  assert.deepEqual(filesUnder(path.join(temporary, 'package')), before);
});

test('complete builds regenerate and package documentation from its templates', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');
  const marker = '\nBuild-owned documentation example.\n';

  fs.appendFileSync(path.join(temporary, 'scripts/README.template.md'), marker);
  fs.writeFileSync(path.join(temporary, 'README.md'), 'stale documentation');
  await build({ root: temporary });

  assert.ok(fs.readFileSync(path.join(temporary, 'README.md'), 'utf8').endsWith(marker));
  assert.equal(
    fs.readFileSync(path.join(temporary, 'package/README.md'), 'utf8'),
    fs.readFileSync(path.join(temporary, 'README.md'), 'utf8')
  );
});

test('read-only builds reject changed documentation templates without rewriting output', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const before = filesUnder(path.join(temporary, 'package'));
  const readme = fs.readFileSync(path.join(temporary, 'README.md'), 'utf8');

  fs.appendFileSync(path.join(temporary, 'scripts/README.template.md'), '\nNew documentation.\n');
  await assert.rejects(build({ root: temporary, check: true }), /stale/);

  assert.equal(fs.readFileSync(path.join(temporary, 'README.md'), 'utf8'), readme);
  assert.deepEqual(filesUnder(path.join(temporary, 'package')), before);
});

test('documentation generation failures preserve the last complete distribution', async (t) => {
  const temporary = copyInputs(t);
  const { build } = require('../scripts/build.js');

  await build({ root: temporary });
  const before = filesUnder(path.join(temporary, 'package'));

  fs.appendFileSync(path.join(temporary, 'scripts/README.template.md'), '\n{{INVALID_RELEASE_TOKEN}}\n');
  await assert.rejects(build({ root: temporary }), /Unknown documentation token/);

  assert.deepEqual(filesUnder(path.join(temporary, 'package')), before);
});
