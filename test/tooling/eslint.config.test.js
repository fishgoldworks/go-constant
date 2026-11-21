'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '../..');
const scopes = [
  'src/conditional-return-probe.js',
  'scripts/conditional-return-probe.cjs',
  'scripts/conditional-return-probe.mjs',
  'test/conditional-return-probe.test.js',
  'test/browser/conditional-return-probe.js',
  'test/types/conditional-return-probe.cts'
];

test('lint rejects unbraced if and else returns in maintained JavaScript and TypeScript', async () => {
  const eslint = new ESLint({ cwd: root });

  for (const filePath of scopes) {
    const parameter = filePath.endsWith('.cts') ? 'value: boolean' : 'value';

    for (const body of ['if (value) return 1;\n\nreturn 0;', 'if (value) { return 1; } else return 0;']) {
      const [result] = await eslint.lintText(`function choose(${parameter}) {\n${body}\n}\n\nchoose(true);\n`, {
        filePath
      });

      assert.equal(result.errorCount, 1, filePath + ': ' + body);
      assert.match(result.messages[0].message, /conditional returns.*braces/i);
    }
  }
});

test('lint accepts braced conditional returns in the same maintained file scopes', async () => {
  const eslint = new ESLint({ cwd: root });

  for (const filePath of scopes) {
    const parameter = filePath.endsWith('.cts') ? 'value: boolean' : 'value';
    const source = `function choose(${parameter}) {
  if (value) {
    return 1;
  } else {
    return 0;
  }
}

choose(true);
`;
    const [result] = await eslint.lintText(source, { filePath });

    assert.equal(result.errorCount, 0, filePath + ': ' + JSON.stringify(result.messages));
    assert.equal(result.warningCount, 0, filePath);
  }
});
