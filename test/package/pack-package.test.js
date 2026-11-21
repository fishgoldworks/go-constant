'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const packedFixture = require('../helpers/packed-fixture');

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/pack-package.js'), 'utf8');
const filename = 'go-constant-2.0.0.tgz';
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-pack-'));

  t.after(() => {
    for (const link of links) fs.unlinkSync(link);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const links = [];
  const destination = path.join(root, 'artifacts');
  const packageRoot = path.join(root, 'package');

  fs.mkdirSync(packageRoot);
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'go-constant', version: '2.0.0' }));
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'go-constant', version: '2.0.0', files: ['index.js'] })
  );
  fs.writeFileSync(path.join(packageRoot, 'index.js'), "module.exports = 'old marker';\n");
  const tarball = path.join(destination, filename);
  const previous = Buffer.from('previous candidate');
  const checksum = digest(previous) + '  ' + filename + '\n';

  fs.writeFileSync(tarball, previous);
  fs.writeFileSync(tarball + '.sha256', checksum);
  const events = [];
  const logs = [];
  const module = { exports: {} };
  const fileSystem = { ...fs };

  for (const method of ['writeFileSync', 'renameSync', 'unlinkSync', 'rmSync']) {
    fileSystem[method] = (...args) => {
      if (options.fail) options.fail(method, ...args);

      return fs[method](...args);
    };
  }

  const modules = {
    'node:fs': fileSystem,
    'node:path': path,
    'node:crypto': crypto,
    'node:child_process': {
      spawnSync(executable, args, settings) {
        events.push('pack');
        if (options.spawn) {
          return options.spawn(executable, args, settings);
        }

        const output = args[args.indexOf('--pack-destination') + 1];

        const packed = packedFixture();

        fs.writeFileSync(path.join(output, filename), packed.bytes);

        return { status: 0, stdout: JSON.stringify([packed.report]), stderr: '' };
      }
    },
    './package-file.js': require('../../scripts/package-file.js'),
    './build.js': {
      async build() {
        events.push('build');
        if (options.build) {
          return options.build();
        }

        fs.writeFileSync(path.join(packageRoot, 'index.js'), "module.exports = 'fresh packed marker';\n");
      }
    }
  };

  vm.runInNewContext(source, {
    require(name) {
      assert.ok(Object.hasOwn(modules, name), 'Unexpected dependency: ' + name);

      return modules[name];
    },
    module,
    __dirname: path.join(root, 'scripts'),
    process: { execPath: process.execPath, env: { npm_execpath: process.env.npm_execpath || 'npm-cli.js' } },
    console: { log: (value) => logs.push(value) }
  });

  return {
    root,
    destination,
    packageRoot,
    tarball,
    previous,
    checksum,
    events,
    logs,
    pack: (directory = destination) => module.exports.packPackage(directory),
    alias(target, name) {
      const link = path.join(root, name);

      fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      links.push(link);

      return link;
    },
    assertPrevious() {
      assert.deepEqual(fs.readFileSync(tarball), previous);
      assert.equal(fs.readFileSync(tarball + '.sha256', 'utf8'), checksum);
      assert.deepEqual(fs.readdirSync(destination).sort(), [filename, filename + '.sha256']);
    }
  };
}

for (const mode of ['direct', 'alias', 'alias-new-descendants', 'broken-alias']) {
  test('packing rejects unsafe output before building: ' + mode, async (t) => {
    const input = fixture(t, {
      build() {
        throw new Error('BUILD_STARTED');
      }
    });
    let destination = path.join(input.packageRoot, 'candidates');

    if (mode.startsWith('alias')) destination = input.alias(input.packageRoot, 'alias');
    if (mode === 'alias-new-descendants') destination = path.join(destination, 'new/candidates');
    if (mode === 'broken-alias') destination = input.alias(path.join(input.root, 'absent'), 'broken');

    await assert.rejects(input.pack(destination), /outside.*package|alias|resolve|ENOENT/i);
    assert.deepEqual(input.events, []);
    input.assertPrevious();
  });
}

test('external aliases and new descendants remain valid pack destinations', async (t) => {
  const input = fixture(t);
  const target = path.join(input.root, 'package-other');

  fs.mkdirSync(target);
  const destination = path.join(input.alias(target, 'external'), 'new/candidates');
  const candidate = await input.pack(destination);

  assert.equal(candidate.tarball, path.join(destination, filename));
  assert.equal(candidate.sha256, digest(fs.readFileSync(candidate.tarball)));
  input.assertPrevious();
});

test('inherited npm dry-run still produces a new archive instead of reusing the previous candidate', async (t) => {
  const npm = process.env.npm_execpath;

  assert.ok(npm, 'Run through npm run test:release.');
  const input = fixture(t, {
    spawn(executable, args, options) {
      return spawnSync(executable, args, {
        ...options,
        env: { ...process.env, npm_config_dry_run: 'true', npm_config_cache: path.join(input.root, 'cache') }
      });
    }
  });
  const seeded = spawnSync(
    process.execPath,
    [
      npm,
      'pack',
      input.packageRoot,
      '--ignore-scripts',
      '--offline',
      '--json',
      '--pack-destination',
      input.destination
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, npm_config_dry_run: 'false', npm_config_cache: path.join(input.root, 'cache') }
    }
  );

  assert.equal(seeded.status, 0, seeded.stderr);
  const before = digest(fs.readFileSync(input.tarball));

  fs.writeFileSync(input.tarball + '.sha256', before + '  ' + filename + '\n');
  const candidate = await input.pack();

  assert.notEqual(candidate.sha256, before);
  assert.ok(zlib.gunzipSync(fs.readFileSync(candidate.tarball)).includes(Buffer.from('fresh packed marker')));
  assert.equal(fs.readFileSync(candidate.tarball + '.sha256', 'utf8'), candidate.sha256 + '  ' + filename + '\n');
});

for (const phase of ['checksum-write', 'backup-archive', 'backup-checksum', 'install-archive', 'install-checksum']) {
  test('failed candidate replacement preserves the prior pair: ' + phase, async (t) => {
    let failed = false;
    const input = fixture(t, {
      fail(method, from, to) {
        if (failed) {
          return;
        }

        const fromOutput = String(from).includes(path.sep + 'output' + path.sep);
        const fromDestination = path.dirname(String(from)) === input.destination;
        const isChecksum = String(from).endsWith('.sha256');
        const match =
          phase === 'checksum-write'
            ? method === 'writeFileSync' && fromOutput && isChecksum
            : phase.startsWith('backup')
              ? method === 'renameSync' && fromDestination && isChecksum === phase.endsWith('checksum')
              : method === 'renameSync' &&
                fromOutput &&
                path.dirname(to) === input.destination &&
                isChecksum === phase.endsWith('checksum');

        if (match) {
          failed = true;
          throw new Error('CONTROLLED_' + phase);
        }
      }
    });

    await assert.rejects(input.pack(), new RegExp('CONTROLLED_' + phase));
    input.assertPrevious();
    assert.equal(input.logs.length, 0);
  });
}

test('failed rollback retains recoverable previous bytes and both failures', async (t) => {
  const input = fixture(t, {
    fail(method, from, to) {
      if (method !== 'renameSync' || path.dirname(to) !== input.destination) {
        return;
      }

      if (from.includes(path.sep + 'output' + path.sep) && from.endsWith('.sha256')) throw new Error('INSTALL_FAILED');
      if (from.includes(path.sep + 'previous' + path.sep) && !from.endsWith('.sha256'))
        throw new Error('RESTORE_FAILED');
    }
  });

  await assert.rejects(input.pack(), (error) => {
    assert.ok(error.errors.some((item) => /INSTALL_FAILED/.test(String(item))));
    assert.ok(error.errors.some((item) => /RESTORE_FAILED/.test(String(item))));
    assert.deepEqual(fs.readFileSync(path.join(error.recoveryDirectory, 'previous', filename)), input.previous);

    return true;
  });
  assert.equal(input.logs.length, 0);
});

test('cleanup failure after installation reports committed output without rolling it back', async (t) => {
  const input = fixture(t, {
    fail(method) {
      if (method === 'rmSync') throw new Error('CLEANUP_FAILED');
    }
  });

  await assert.rejects(input.pack(), (error) => {
    assert.equal(error.committed, true);
    assert.equal(error.tarball, input.tarball);
    const contents = fs.readFileSync(input.tarball);

    assert.notDeepEqual(contents, input.previous);
    assert.equal(fs.readFileSync(input.tarball + '.sha256', 'utf8'), digest(contents) + '  ' + filename + '\n');

    return true;
  });
  assert.equal(input.logs.length, 0);
});

for (const mode of ['missing-output', 'partial-pack-failure', 'invalid-gzip', 'ambiguous-report']) {
  test('invalid or incomplete fresh packing preserves the prior pair: ' + mode, async (t) => {
    const input = fixture(t, {
      spawn(executable, args) {
        const output = args[args.indexOf('--pack-destination') + 1];

        if (mode !== 'missing-output')
          fs.writeFileSync(
            path.join(output, filename),
            mode === 'invalid-gzip' ? 'not gzip' : zlib.gzipSync('partial output')
          );
        const report = { filename, files: [{ path: 'index.js' }] };

        return {
          status: mode === 'partial-pack-failure' ? 17 : 0,
          stdout: JSON.stringify(mode === 'ambiguous-report' ? [report, report] : [report]),
          stderr: 'CONTROLLED_PACK_OUTPUT'
        };
      }
    });

    await assert.rejects(input.pack());
    input.assertPrevious();
    assert.equal(input.logs.length, 0);
  });
}

test('rollback preserves an absent old checksum instead of leaving a new one', async (t) => {
  const input = fixture(t, {
    fail(method, from, to) {
      if (
        method === 'renameSync' &&
        from.includes(path.sep + 'output' + path.sep) &&
        from.endsWith('.sha256') &&
        path.dirname(to) === input.destination
      )
        throw new Error('INSTALL_CHECKSUM_FAILED');
    }
  });

  fs.unlinkSync(input.tarball + '.sha256');
  await assert.rejects(input.pack(), /INSTALL_CHECKSUM_FAILED/);
  assert.deepEqual(fs.readFileSync(input.tarball), input.previous);
  assert.equal(fs.existsSync(input.tarball + '.sha256'), false);
});

test('a packing failure and staging cleanup failure retain both causes', async (t) => {
  const cleanup = new Error('CLEANUP_FAILED');
  const input = fixture(t, {
    spawn() {
      throw null;
    },
    fail(method) {
      if (method === 'rmSync') throw cleanup;
    }
  });

  await assert.rejects(input.pack(), (error) => {
    assert.deepEqual(Array.from(error.errors), [null, cleanup]);

    return true;
  });
  assert.deepEqual(fs.readFileSync(input.tarball), input.previous);
  assert.equal(fs.readFileSync(input.tarball + '.sha256', 'utf8'), input.checksum);
});

for (const mode of [
  'truncated-gzip',
  'corrupt-gzip',
  'not-tar',
  'bad-header-checksum',
  'missing-tar-end',
  'wrong-package',
  'wrong-version',
  'wrong-inventory'
]) {
  test('invalid archive payload cannot replace a retained candidate: ' + mode, async (t) => {
    const input = fixture(t, {
      spawn(executable, args) {
        const packed = packedFixture();
        const output = args[args.indexOf('--pack-destination') + 1];
        let bytes = Buffer.from(packed.bytes);

        if (mode === 'truncated-gzip') bytes = bytes.subarray(0, 2);
        if (mode === 'corrupt-gzip') bytes[bytes.length - 1] ^= 1;
        if (mode === 'not-tar') bytes = zlib.gzipSync('not a tar archive');
        if (mode === 'bad-header-checksum') {
          const tar = zlib.gunzipSync(bytes);

          tar[0] ^= 1;
          bytes = zlib.gzipSync(tar);
        }

        if (mode === 'missing-tar-end') {
          const tar = zlib.gunzipSync(bytes);

          bytes = zlib.gzipSync(tar.subarray(0, tar.length - 1024));
        }

        if (mode === 'wrong-package')
          bytes = zlib.gzipSync(zlib.gunzipSync(bytes).toString('utf8').replace('go-constant', 'no-constant'));
        if (mode === 'wrong-version')
          bytes = zlib.gzipSync(zlib.gunzipSync(bytes).toString('utf8').replace('2.0.0', '1.0.0'));
        fs.writeFileSync(path.join(output, filename), bytes);
        const report = mode === 'wrong-inventory' ? { ...packed.report, files: [{ path: 'index.js' }] } : packed.report;

        return { status: 0, stdout: JSON.stringify([report]), stderr: '' };
      }
    });

    await assert.rejects(input.pack());
    input.assertPrevious();
    assert.equal(input.logs.length, 0);
  });
}
