'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let temporary;

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  return result.stdout;
}

try {
  // Keep the emitted import ../../index.js pointing at this package's root.
  temporary = fs.mkdtempSync(path.join(root, 'test/.type-runtime-'));
  run([
    require.resolve('typescript/bin/tsc'),
    '--strict',
    '--noEmitOnError',
    '--target',
    'ES2020',
    '--module',
    'Node16',
    '--moduleResolution',
    'Node16',
    '--outDir',
    temporary,
    'test/types/runtime.cts'
  ]);
  process.stdout.write(run([path.join(temporary, 'runtime.cjs')]));
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
