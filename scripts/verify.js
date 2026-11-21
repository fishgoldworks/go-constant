'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { packPackage } = require('./pack-package.js');
const { build } = require('./build.js');
const { readCandidate, options, assertOutsidePackage } = require('./package-file.js');
const { packageRoot } = require('./package-layout.js');
const { scripts = {} } = require('../package.json');
const root = path.resolve(__dirname, '..');

async function main() {
  const argv = process.argv.slice(2);
  const browser = argv.includes('--browser');

  if (browser) argv.splice(argv.indexOf('--browser'), 1);
  const args = options(argv, ['tarball', 'node']);
  const commands = [
    'lint',
    'format:check',
    'test:docs',
    'coverage',
    'test:types',
    'test:build',
    'test:artifacts',
    'test:tooling',
    'test:release',
    'test:mutations',
    'test:package',
    ...(browser ? ['test:browser'] : [])
  ];

  for (const command of commands) {
    if (!Object.hasOwn(scripts, command) || typeof scripts[command] !== 'string' || !scripts[command].trim()) {
      throw new Error('Missing required npm script: ' + command);
    }
  }

  if (args.tarball) assertOutsidePackage(args.tarball, packageRoot);
  const retained = args.tarball ? readCandidate(args.tarball) : null;
  const floor = args.node || process.env.GO_CONSTANT_NODE8;

  if (!floor)
    throw new Error(
      'Supply --node <Node 8.0.0 executable> or set GO_CONSTANT_NODE8 for the required consumer-floor check.'
    );
  const runtime = spawnSync(floor, ['--version'], { encoding: 'utf8', timeout: 10000 });

  if (runtime.error) throw runtime.error;
  assert.equal(runtime.status, 0, runtime.stderr);
  assert.equal(runtime.stdout.trim(), 'v8.0.0', 'The release gate requires the exact Node 8.0.0 floor.');
  const npm = process.env.npm_execpath;

  if (!npm) throw new Error('Run this gate with npm run verify.');
  const candidate = retained || (await packPackage());

  if (retained) await build({ root });
  for (const command of commands) {
    const extra =
      command === 'test:package'
        ? ['--', '--tarball', candidate.tarball, '--node', floor, '--compare-package', packageRoot]
        : command === 'test:browser'
          ? ['--', '--tarball', candidate.tarball]
          : [];
    const result = spawnSync(process.execPath, [npm, 'run', command, '--if-present=false', ...extra], {
      cwd: root,
      stdio: 'inherit',
      env: process.env
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(command + ' failed (' + (result.signal || result.status) + ')');
  }

  assert.equal(readCandidate(candidate.tarball).sha256, candidate.sha256, 'Candidate changed during verification');
  console.log('Verified release candidate: ' + candidate.tarball + '\nSHA-256: ' + candidate.sha256);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
