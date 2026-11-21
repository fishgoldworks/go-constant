'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packageRoot = path.resolve(process.env.GO_CONSTANT_PACKAGE_ROOT || path.join(root, 'package'));
let temporary;

try {
  const readme = ['README.md', 'docs/API.md']
    .map((file) => fs.readFileSync(path.join(packageRoot, file), 'utf8').replace(/\r\n/g, '\n'))
    .join('\n');
  const snippets = [...readme.matchAll(/```typescript\n([\s\S]*?)\n```/g)];

  assert.ok(snippets.length >= 2, 'TypeScript usage examples must be present.');
  // Keep examples inside the selected package scope so TypeScript and Node resolve
  // its public exports. The compiler itself remains a development dependency.
  const exampleParent = packageRoot;

  temporary = fs.mkdtempSync(path.join(exampleParent, '.readme-'));
  const files = snippets.map(([, text], i) => {
    const file = path.join(temporary, `example-${i + 1}.mts`);

    fs.writeFileSync(file, text + '\n');

    return file;
  });
  const result = spawnSync(
    process.execPath,
    [
      process.env.GO_CONSTANT_TYPESCRIPT || require.resolve('typescript/bin/tsc'),
      '--strict',
      '--noEmitOnError',
      '--target',
      'ES2020',
      '--module',
      'Node16',
      '--moduleResolution',
      'Node16',
      ...files
    ],
    { cwd: packageRoot, encoding: 'utf8', timeout: 30000 }
  );

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of files) {
    const emitted = file.replace(/\.mts$/, '.mjs');
    const expected = [];
    const source = fs
      .readFileSync(emitted, 'utf8')
      .split('\n')
      .map((line) => {
        const result = /^(.*?)\s*\/\/ => (.+)$/.exec(line);

        if (!result) {
          return line;
        }

        const error = /^throws ([A-Za-z_$][\w$]*)$/.exec(result[2]);

        if (error) {
          return `__assertThrows(() => { ${result[1]} }, ${JSON.stringify(error[1])});`;
        }

        expected.push(JSON.parse(result[2]));

        return line;
      })
      .join('\n');

    fs.writeFileSync(
      emitted,
      `import assert from "node:assert/strict";
const __results = [];
const console = { log(value) { __results.push(value); } };
const __assertThrows = (callback, name) => assert.throws(callback, error => error.name === name);
${source}
assert.deepEqual(__results, ${JSON.stringify(expected)});
`
    );
    const execution = spawnSync(process.execPath, [emitted], { cwd: packageRoot, encoding: 'utf8', timeout: 10000 });

    assert.ifError(execution.error);
    assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  }

  console.log(
    `${snippets.length} README/API TypeScript examples from ${packageRoot} pass strict checking and execute with their documented results.`
  );
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
