import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import ts from 'typescript';
import { readabilityFixRuleIds } from '../../scripts/readability.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testSpacingRule = 'go-constant-test-spacing/adjacent-cases';
const options = JSON.parse(fs.readFileSync(path.join(root, '.prettierrc.json'), 'utf8'));
const sample = `const LogLevel = (value, name) => ({ value, name });
/** OFF docs */
LogLevel.OFF = LogLevel(0, 'off'); // Previous member's note.
/** ALL docs */
LogLevel.ALL = LogLevel(1, 'all');
/** INFO docs */
LogLevel.INFO = LogLevel(300, 'info');
`;

for (const [name, source] of [
  ['direct cases', "const {test}=require('node:test');\ntest('first',()=>{});\ntest('second',()=>{});"],
  ['imported aliases', "import {test as check} from 'node:test';\ncheck('first',()=>{});\ncheck('second',()=>{});"],
  [
    'awaited subtests',
    "const {test}=require('node:test');\ntest('outer',async t=>{await t.test('first',()=>{});\nawait t.test('second',()=>{});});"
  ],
  [
    'returning wrappers',
    "const {test}=require('node:test');\nconst check=(name,body)=>test(name,body);\ncheck('first',()=>{});\ncheck('second',()=>{});"
  ],
  [
    'generated groups',
    "const {test}=require('node:test');\nfor(const value of [1]){test(String(value),()=>{});}\nfor(const value of [2]){test(String(value),()=>{});}"
  ]
]) {
  test('test spacing rejects adjacent ' + name + ' without adding unsafe fixes', async () => {
    const eslint = new ESLint({ cwd: root, concurrency: 'off' });
    const [result] = await eslint.lintText(source, { filePath: path.join(root, 'test/case-spacing-fixture.mjs') });
    const messages = result.messages.filter((message) => message.ruleId === testSpacingRule);

    assert.equal(messages.length, 1, JSON.stringify(result.messages));
    assert.equal(messages[0].fix, undefined);
  });
}

test('test spacing accepts separated cases and ignores strings, unrelated methods and shadowed names', async () => {
  const source = `const {test}=require('node:test');
test('first',()=>{});

test('second',()=>{});
const example = "test('one');\\ntest('two');";
void example;
const expression = /x/;
expression.test('x');
expression.test('x');
function unrelated(test) { test('one'); test('two'); }
void unrelated;
const t = { test() {} };
t.test();
t.test();
`;
  const [result] = await new ESLint({ cwd: root, concurrency: 'off' }).lintText(source, {
    filePath: path.join(root, 'test/case-spacing-fixture.js')
  });

  assert.deepEqual(
    result.messages.filter((message) => message.ruleId === testSpacingRule),
    []
  );
  assert.equal(readabilityFixRuleIds.includes(testSpacingRule), false);
});

test('test spacing does not classify reassigned aliases as test registrars', async () => {
  const source = `const {test}=require('node:test');
let run = test;
run = () => {};
run('first');
run('second');
`;
  const [result] = await new ESLint({ cwd: root, concurrency: 'off' }).lintText(source, {
    filePath: path.join(root, 'test/case-spacing-fixture.js')
  });

  assert.deepEqual(
    result.messages.filter((message) => message.ruleId === testSpacingRule),
    []
  );
});

function checker(fix = false) {
  return new ESLint({
    cwd: root,
    cache: false,
    concurrency: 'off',
    fix: fix ? (message) => readabilityFixRuleIds.includes(message.ruleId) : false
  });
}

async function cycle(source, filename = 'src/readability-fixture.js') {
  const filepath = path.join(root, filename);
  const normalized = await prettier.format(source, { ...options, filepath });
  const [result] = await checker(true).lintText(normalized, { filePath: filepath });
  const output = result.output || normalized;

  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  assert.equal(result.warningCount, 0, JSON.stringify(result.messages));
  assert.equal(
    await prettier.format(output, { ...options, filepath }),
    output,
    'ESLint fixes must remain Prettier-compatible'
  );

  return output;
}

test('real config rejects and fixes each documented-assignment separator, including a trailing comment', async () => {
  const [before] = await checker().lintText(sample, { filePath: path.join(root, 'src/readability-fixture.js') });

  assert.ok(before.messages.some((message) => message.ruleId === 'jsdoc/lines-before-block'));

  const output = await cycle(sample);

  assert.match(output, /Previous member's note\.\n\n\/\*\* ALL docs \*\/\nLogLevel\.ALL/);
  assert.match(output, /all'\);\n\n\/\*\* INFO docs \*\/\nLogLevel\.INFO/);
  assert.equal(await cycle(output), output);

  const multiline = sample.replace(
    /\/\*\* (OFF|ALL|INFO) docs \*\//g,
    (_, name) =>
      `/**\n * Built-in ${name} severity.\n * @see https://github.com/fishgoldworks/go-logs/blob/master/docs/API.md#level${name.toLowerCase()}\n */`
  );
  const documented = await cycle(multiline);

  assert.match(documented, /Previous member's note\.\n\n\/\*\*\n \* Built-in ALL/);
  assert.match(documented, /#levelall\n \*\/\nLogLevel\.ALL/);
  assert.equal(await cycle(documented), documented);
});

for (const extension of ['js', 'cjs', 'mjs', 'jsx', 'ts', 'cts', 'mts', 'tsx', 'd.ts', 'd.cts', 'd.mts']) {
  test('effective readability configuration and stable workflow for .' + extension, async () => {
    const filename = 'test/readability-fixture.' + extension;
    const config = await checker().calculateConfigForFile(path.join(root, filename));

    assert.equal(config.rules['jsdoc/lines-before-block'][0], 2);
    assert.equal(config.rules['@stylistic/padding-line-between-statements'][0], 2);
    const declarations = extension.startsWith('d.');
    const source = declarations
      ? `export interface Pair {\n/** First */\nfirst: number;\n/** Second */\nsecond: number;\n}\n`
      : sample + (extension === 'jsx' || extension === 'tsx' ? 'const view = <div />;\nvoid view;\n' : '');
    const output = await cycle(source, filename);

    assert.equal(await cycle(output, filename), output);
    assert.match(output, declarations ? /first: number;\n\n\s*\/\*\* Second/ : /note\.\n\n\/\*\* ALL/);
  });
}

test('grouped declarations and assertions stay compact; setup, blocks and final returns are separated', async () => {
  const output = await cycle(
    `const assert = require('node:assert');\nconst actual = 1;\nconst expected = 1;\nassert.equal(actual, expected);\nassert.equal(expected, actual);\nfunction get() { const result = {}; result.ready = true; return result; }\nvoid get;\n`
  );

  assert.match(output, /const actual = 1;\nconst expected = 1;\n\nassert/);
  assert.match(output, /assert.equal\(actual, expected\);\nassert.equal\(expected, actual\);/);
  assert.match(output, /result.ready = true;\n\n\s+return result;/);
  assert.match(output, /}\n\nvoid get;/);
});

test('container starts, inline casts, overloads and import-equals remain stable', async () => {
  const source = `import Assert = require('node:assert');\nexport interface Pair {\n/** First */\nfirst: number;\n/** Second */\nsecond: string;\n}\nexport type Data = {\n/** Value */\nvalue: number;\n};\nexport enum State {\n/** Ready */\nReady,\n/** Done */\nDone\n}\nexport function value(input: number): number;\nexport function value(input: string): string;\nexport function value(input: number | string): number | string { return input; }\nvoid Assert;\n`;
  const output = await cycle(source, 'test/readability-fixture.ts');

  assert.match(output, /interface Pair \{\n\s+\/\*\* First/);
  assert.match(output, /function value\(input: number\): number;\nexport function value\(input: string\): string;/);
  assert.equal(await cycle(output, 'test/readability-fixture.ts'), output);
  const ambient = await cycle(
    'export declare namespace Space {\n/** Event */\ninterface Event { id: number; }\n}\n',
    'test/readability-fixture.d.ts'
  );

  assert.equal(await cycle(ambient, 'test/readability-fixture.d.ts'), ambient);
  const cast = await cycle('const value = /** @type {number} */ (1);\nvoid value;\n');

  assert.match(cast, /= \/\*\* @type \{number\} \*\/ \(1\)/);
});

function temporaryProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-readability-'));

  fs.mkdirSync(path.join(directory, 'scripts'));
  for (const name of ['eslint.config.mjs', '.prettierrc.json', '.prettierignore'])
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  for (const name of ['readability.mjs', 'format.mjs'])
    fs.copyFileSync(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  const modules = path.join(directory, 'node_modules');

  fs.symlinkSync(path.join(root, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.unlinkSync(modules);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return directory;
}

function runFormat(directory, cwd = directory) {
  return spawnSync(process.execPath, [path.join(directory, 'scripts/format.mjs')], {
    cwd,
    encoding: 'utf8',
    timeout: 30000
  });
}

test('actual formatting CLI fixes once, preserves exclusions, anchors its root and is stable on the second cycle', (t) => {
  const directory = temporaryProject(t);

  fs.writeFileSync(path.join(directory, 'sample.js'), sample);
  const excluded = [
    'package/generated.js',
    'benchmarks/baseline/external.js',
    '.tmp/negative.js',
    'docs/performance-history/HISTORICAL.md'
  ];
  const bytes = 'intentionally   unformatted( );\n';

  for (const name of excluded) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), bytes);
  }

  fs.mkdirSync(path.join(directory, 'nested'));
  const first = runFormat(directory, path.join(directory, 'nested'));

  assert.equal(first.status, 0, first.stdout + first.stderr);
  const output = fs.readFileSync(path.join(directory, 'sample.js'), 'utf8');

  assert.match(output, /note\.\n\n\/\*\* ALL/);
  for (const name of excluded) assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), bytes);
  const second = runFormat(directory);

  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(fs.readFileSync(path.join(directory, 'sample.js'), 'utf8'), output);
});

test('formatting leaves unrelated fixable errors and unused-disable directives intact, reports them and still checks Prettier', (t) => {
  const directory = temporaryProject(t);
  const source = `/* eslint-disable-next-line no-undef */\nconst ready = true;\nif (!!ready) { module.exports = ready; }\n`;

  fs.writeFileSync(path.join(directory, 'sample.js'), source);
  const result = runFormat(directory);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /no-extra-boolean-cast/);
  assert.match(result.stdout, /Unused eslint-disable directive/);
  assert.match(result.stdout, /Checking formatting/);
  const output = fs.readFileSync(path.join(directory, 'sample.js'), 'utf8');

  assert.match(output, /if \(!!ready\)/);
  assert.match(output, /eslint-disable-next-line no-undef/);
});

test('canonical checker retains correctness lint while excluding externally owned spacing', async () => {
  const config = await checker().calculateConfigForFile(path.join(root, 'scripts/lib/check-library-readme.cjs'));

  assert.equal(config.rules['no-undef'][0], 2);
  for (const id of readabilityFixRuleIds) assert.equal(config.rules[id][0], 0);
});

test('formatting preserves TypeScript suppression targets and ESLint/coverage/preprocessor directive adjacency', async (t) => {
  const source = `const value = 1;\n// @ts-expect-error Intentional incompatible assignment.\nconst text: string = value;\nvoid text;\n`;
  const output = await cycle(source, 'test/readability-fixture.ts');

  assert.match(output, /@ts-expect-error Intentional incompatible assignment\.\nconst text/);
  const directory = temporaryProject(t);
  const file = path.join(directory, 'directive.ts');
  const diagnostics = (text) => {
    fs.writeFileSync(file, text);
    const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2017, types: [] });

    return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
  };

  assert.deepEqual(diagnostics(source), []);
  assert.deepEqual(diagnostics(output), []);
  assert.ok(
    diagnostics(output.replace('// @ts-expect-error Intentional incompatible assignment.\n', '')).includes(2322)
  );
  assert.ok(diagnostics(output.replace('const text: string', 'const text: number')).includes(2578));
  const js = `const before = 1;\n// eslint-disable-next-line no-undef\nconst value = missing;\n/* node:coverage ignore next */\nif (value) { module.exports = before; }\n/*#if FEATURE*/\nmodule.exports = value;\n//#endif\n`;
  const formatted = await cycle(js);

  assert.match(formatted, /eslint-disable-next-line no-undef\nconst value = missing/);
  assert.match(formatted, /node:coverage ignore next \*\/\nif/);
  assert.match(formatted, /\/\*#if FEATURE\*\/\nmodule.exports = value;\n\/\/#endif/);
  const [unsuppressed] = await checker().lintText(formatted.replace('// eslint-disable-next-line no-undef\n', ''), {
    filePath: path.join(root, 'src/readability-fixture.js')
  });

  assert.ok(unsuppressed.messages.some((message) => message.ruleId === 'no-undef'));
});

test('padding preserves trailing next-line directives and their complete comment chain', async () => {
  for (const comment of [
    '// eslint-disable-next-line no-undef',
    '/* eslint-disable-next-line no-undef */',
    '/* eslint-disable-next-line no-undef */ // trailing note',
    '/* first note */ /* eslint-disable-next-line no-undef */ // trailing note'
  ]) {
    for (const nested of [false, true]) {
      const body = `const before = 1; ${comment}\nmodule.exports = before + missing;\n`;
      const source = nested ? `function read() {\n${body}}\nread();\n` : body;
      const output = await cycle(source);

      assert.match(output, /const before = 1;\n\n\s*(?:\/\* first note \*\/ )?(?:\/\/|\/\*) eslint-disable-next-line/);
      assert.equal(await cycle(output), output);
      const [control] = await checker().lintText(output.replace(comment, ''), {
        filePath: path.join(root, 'src/readability-fixture.js')
      });

      assert.ok(control.messages.some((message) => message.ruleId === 'no-undef'));
    }
  }
});

test('padding preserves trailing TypeScript next-line suppression targets', async (t) => {
  const directory = temporaryProject(t);
  const file = path.join(directory, 'trailing-directive.ts');

  for (const directive of ['@ts-expect-error', '@ts-ignore']) {
    const source = `export function read(): string {\n  const before = 1; // ${directive} Intentional incompatible assignment.\n  return before;\n}\n`;
    const filename = path.join(root, 'test/readability-fixture.ts');
    const normalized = await prettier.format(source, { ...options, filepath: filename });
    const [result] = await checker(true).lintText(normalized, { filePath: filename });
    const output = result.output || normalized;

    assert.deepEqual(
      result.messages.map((message) => message.ruleId),
      directive === '@ts-ignore' ? ['@typescript-eslint/ban-ts-comment'] : []
    );
    assert.equal(await prettier.format(output, { ...options, filepath: filename }), output);
    const diagnostics = (text) => {
      fs.writeFileSync(file, text);
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2017,
        types: []
      });

      return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
    };

    assert.deepEqual(diagnostics(source), []);
    assert.deepEqual(diagnostics(output), []);
    assert.ok(diagnostics(output.replace(`// ${directive} Intentional incompatible assignment.\n`, '')).includes(2322));
    const [again] = await checker(true).lintText(output, { filePath: filename });

    assert.equal(again.output || output, output);
    assert.deepEqual(
      again.messages.map((message) => message.ruleId),
      result.messages.map((message) => message.ruleId)
    );
  }
});

for (const preserveMain of [false, true]) {
  test(
    'actual CLI formats through a junction or symbolic link' + (preserveMain ? ' with preserved main symlinks' : ''),
    (t) => {
      const directory = temporaryProject(t);
      const alias = directory + '-alias';

      fs.symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
      t.after(() => fs.unlinkSync(alias));
      fs.writeFileSync(path.join(directory, 'sample.js'), sample);
      const result = spawnSync(
        process.execPath,
        [...(preserveMain ? ['--preserve-symlinks-main'] : []), path.join(alias, 'scripts/format.mjs')],
        { cwd: alias, encoding: 'utf8', timeout: 30000 }
      );

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Checking formatting/);
      assert.match(fs.readFileSync(path.join(directory, 'sample.js'), 'utf8'), /note\.\n\n\/\*\* ALL/);
    }
  );
}

test('actual formatting CLI rejects unsupported arguments before writing', (t) => {
  const directory = temporaryProject(t);
  const file = path.join(directory, 'sample.js');

  fs.writeFileSync(file, sample);
  const result = spawnSync(process.execPath, [path.join(directory, 'scripts/format.mjs'), '--check'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /accepts no arguments/);
  assert.equal(fs.readFileSync(file, 'utf8'), sample);
});

test('importing the private formatter from stdin remains harmless', (t) => {
  const directory = temporaryProject(t);
  const file = path.join(directory, 'sample.js');
  const url = pathToFileURL(path.join(directory, 'scripts/format.mjs')).href;

  fs.writeFileSync(file, sample);
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    cwd: directory,
    input: `const formatter = await import(${JSON.stringify(url)}); console.log(typeof formatter.formatProject);`,
    encoding: 'utf8',
    timeout: 30000
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), 'function');
  assert.equal(fs.readFileSync(file, 'utf8'), sample);
});

test('selected fixes preserve actual Node coverage directives and counted spans', async (t) => {
  const directory = temporaryProject(t);
  const file = path.join(directory, 'coverage-target.cjs');
  const coverage = (source) => {
    fs.writeFileSync(file, source);
    const env = { ...process.env };

    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;

    return spawnSync(
      process.execPath,
      [
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-branches=100',
        '--test-coverage-include=coverage-target.cjs',
        file
      ],
      { cwd: directory, env, encoding: 'utf8', timeout: 30000 }
    );
  };

  for (const [comment, body] of [
    ['/* node:coverage ignore next */', 'const before = ready; MARKER\nreturn before ? before : false;'],
    ['/* node:coverage ignore next 2 */', 'const before = ready; MARKER\nreturn before ? before : false;'],
    ['/* node:coverage ignore next 2 */', 'MARKER\nconst before = ready;\nreturn before ? before : false;'],
    [
      '/* node:coverage ignore next 2 */',
      'const before = ready;\nMARKER\n/** Preserve branch. */\nreturn before ? before : false;'
    ]
  ]) {
    const source = `const assert = require('node:assert/strict');\nfunction read(ready) {\n${body.replace('MARKER', comment)}\n}\nassert.equal(read(true), true);\n`;
    const normalized = await prettier.format(source, { ...options, filepath: file });
    const before = coverage(normalized);
    const [result] = await checker(true).lintText(normalized, {
      filePath: path.join(root, 'src/readability-fixture.js')
    });
    const output = result.output || normalized;
    const after = coverage(output);
    const control = coverage(output.replace(comment, ''));

    assert.ok(result.messages.length > 0, 'Unsafe spacing fixes must remain reported for explicit reconciliation');
    assert.ok(result.messages.every((message) => readabilityFixRuleIds.includes(message.ruleId)));
    assert.equal(before.status, 0, before.stdout + before.stderr);
    assert.equal(after.status, 0, after.stdout + after.stderr);
    assert.equal(control.status, 1, control.stdout + control.stderr);
    assert.match(control.stdout + control.stderr, /branch coverage does not meet threshold/);
    const [again] = await checker(true).lintText(output, { filePath: path.join(root, 'src/readability-fixture.js') });

    assert.equal(again.output || output, output);
    assert.equal(await prettier.format(output, { ...options, filepath: file }), output);
  }
});
