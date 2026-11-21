'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const packedFixture = require('../helpers/packed-fixture');
const metadata = require('../../package.json');
const { readCandidate } = require('../../scripts/package-file.js');

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/verify.js'), 'utf8');

test('verification CLI preserves nested packing failures and recovery properties', async () => {
  const primary = new Error('PRIMARY_PACK_FAILURE');
  const restore = new Error('RESTORE_FAILURE');
  const aggregate = new AggregateError([primary, restore], 'Packing recovery failed');

  aggregate.recoveryDirectory = 'retained-recovery';
  const caused = new Error('Committed output cleanup failed', { cause: restore });

  caused.committed = true;
  caused.tarball = 'active-candidate.tgz';
  for (const failure of [aggregate, caused]) {
    const errors = [];
    const state = {
      argv: ['node', 'verify.js', '--node', 'node8'],
      env: { npm_execpath: 'npm-cli.js' },
      execPath: process.execPath
    };
    const modules = {
      '../package.json': metadata,
      'node:assert/strict': assert,
      'node:path': path,
      'node:child_process': { spawnSync: () => ({ status: 0, stdout: 'v8.0.0\n' }) },
      './package-file.js': require('../../scripts/package-file.js'),
      './package-layout.js': { packageRoot: path.join(os.tmpdir(), 'unused-package') },
      './build.js': {},
      './pack-package.js': {
        async packPackage() {
          throw failure;
        }
      }
    };

    vm.runInNewContext(source, {
      require: (name) => modules[name],
      __dirname: __dirname,
      process: state,
      console: { log() {}, error: (error) => errors.push(error) }
    });
    await new Promise(setImmediate);

    assert.equal(state.exitCode, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0], failure, 'Logger must retain errors, causes and structured recovery information');
  }
});

for (const browser of [false, true]) {
  for (const alias of [false, true]) {
    test(`retained input under generated output is rejected before work: browser=${browser}, alias=${alias}`, async (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-guard-'));
      const packageRoot = path.join(root, 'package');
      const link = path.join(root, 'alias');

      fs.mkdirSync(packageRoot);
      fs.writeFileSync(path.join(packageRoot, 'retained.tgz'), 'keep this candidate');
      if (alias) fs.symlinkSync(packageRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
      t.after(() => {
        if (alias) fs.unlinkSync(link);
        fs.rmSync(root, { recursive: true, force: true });
      });
      const archive = path.join(alias ? link : packageRoot, 'retained.tgz');
      const errors = [];
      const work = [];
      const state = {
        argv: ['node', 'verify.js', '--tarball', archive, '--node', 'node8', ...(browser ? ['--browser'] : [])],
        env: { npm_execpath: 'npm-cli.js' },
        execPath: process.execPath
      };
      const modules = {
        '../package.json': metadata,
        'node:assert/strict': assert,
        'node:path': path,
        'node:child_process': {
          spawnSync() {
            work.push('child');

            return { status: 0, stdout: 'v8.0.0\n' };
          }
        },
        './package-file.js': require('../../scripts/package-file.js'),
        './package-layout.js': { packageRoot },
        './build.js': {
          async build() {
            work.push('build');
          }
        },
        './pack-package.js': {
          async packPackage() {
            work.push('pack');
          }
        }
      };

      vm.runInNewContext(source, {
        require: (name) => modules[name],
        __dirname: path.join(root, 'scripts'),
        process: state,
        console: { log() {}, error: (error) => errors.push(String(error)) }
      });
      await new Promise(setImmediate);

      assert.equal(state.exitCode, 1);
      assert.match(errors.join('\n'), /outside.*package/i);
      assert.deepEqual(work, []);
      assert.equal(fs.readFileSync(archive, 'utf8'), 'keep this candidate');
    });
  }
}

for (const browser of [false, true]) {
  test('retained verification builds clean inputs without repacking' + (browser ? ' with browsers' : ''), async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-clean-verify-'));

    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const archive = path.join(root, 'retained.tgz');
    const packageRoot = path.join(root, 'package');

    fs.writeFileSync(archive, packedFixture().bytes);
    const candidate = readCandidate(archive);
    const commands = [];
    const errors = [];
    let builds = 0;
    let packs = 0;
    const processState = {
      argv: [
        'node',
        path.join(root, 'scripts/verify.js'),
        '--tarball',
        archive,
        '--node',
        'node8',
        ...(browser ? ['--browser'] : [])
      ],
      env: { npm_execpath: 'npm-cli.js' },
      execPath: process.execPath
    };
    const modules = {
      '../package.json': metadata,
      'node:assert/strict': assert,
      'node:path': path,
      'node:child_process': {
        spawnSync(executable, args) {
          if (args[0] === '--version') {
            return { status: 0, stdout: 'v8.0.0\n' };
          }

          assert.equal(fs.existsSync(packageRoot), true, 'Build output must exist before verification commands');
          assert.ok(args.includes('--if-present=false'), 'Every mandatory script must override npm if-present');
          commands.push(args);

          return { status: 0 };
        }
      },
      './pack-package.js': {
        async packPackage() {
          packs++;
          throw new Error('Retained verification must not repack');
        }
      },
      './build.js': {
        async build({ check }) {
          builds++;
          if (check && !fs.existsSync(packageRoot)) {
            throw new Error('Comparison build is missing');
          }

          fs.mkdirSync(packageRoot, { recursive: true });
        }
      },
      './package-file.js': require('../../scripts/package-file.js'),
      './package-layout.js': { packageRoot }
    };

    vm.runInNewContext(source, {
      require(name) {
        assert.ok(Object.hasOwn(modules, name), 'Unexpected dependency ' + name);

        return modules[name];
      },
      __dirname: path.join(root, 'scripts'),
      process: processState,
      console: {
        log() {},
        error(error) {
          errors.push(String(error));
        }
      }
    });
    await new Promise(setImmediate);

    assert.equal(processState.exitCode, undefined, errors.join('\n'));
    assert.equal(builds, 1);
    assert.equal(packs, 0);
    assert.deepEqual(readCandidate(archive), candidate);
    const packageCommand = commands.find((args) => args[2] === 'test:package');

    assert.ok(packageCommand);
    assert.equal(packageCommand[packageCommand.indexOf('--tarball') + 1], archive);
    assert.equal(packageCommand[packageCommand.indexOf('--compare-package') + 1], packageRoot);
    assert.equal(
      commands.some((args) => args[2] === 'test:browser'),
      browser
    );
  });
}

test('required scripts are checked before packing or running child commands', async () => {
  const scripts = { ...metadata.scripts };

  delete scripts['test:mutations'];
  const errors = [];
  const state = {
    argv: ['node', 'verify.js', '--node', 'node8'],
    env: { npm_execpath: 'npm-cli.js', npm_config_if_present: 'true' },
    execPath: process.execPath
  };
  const modules = {
    '../package.json': { ...metadata, scripts },
    'node:assert/strict': assert,
    'node:path': path,
    'node:child_process': {
      spawnSync() {
        assert.fail('child work must not start');
      }
    },
    './package-file.js': require('../../scripts/package-file.js'),
    './package-layout.js': { packageRoot: path.join(os.tmpdir(), 'unused-package') },
    './build.js': {},
    './pack-package.js': {
      packPackage() {
        assert.fail('must not pack');
      }
    }
  };

  vm.runInNewContext(source, {
    require: (name) => modules[name],
    __dirname,
    process: state,
    console: { log() {}, error: (error) => errors.push(String(error)) }
  });
  await new Promise(setImmediate);

  assert.equal(state.exitCode, 1);
  assert.match(errors.join('\n'), /Missing required npm script: test:mutations/);
});
