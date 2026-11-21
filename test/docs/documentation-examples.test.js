'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const packageRoot = path.resolve(process.env.GO_CONSTANT_PACKAGE_ROOT || path.join(__dirname, '../../package'));
const packageRequire = createRequire(path.join(packageRoot, 'package.json'));
const Constant = packageRequire('go-constant');
const readme = ['README.md', 'docs/API.md']
  .map((file) => fs.readFileSync(path.join(packageRoot, file), 'utf8').replace(/\r\n/g, '\n'))
  .join('\n');
const snippets = [...readme.matchAll(/```(javascript|cjs|mjs|html)\n([\s\S]*?)\n```/g)];

// Source comments are shipped to JavaScript consumers too. Exercise their
// examples against the same selected package used for README/reference checks.
for (const file of ['src/Constant.js', 'src/defineType.js', 'src/defineEnum.js']) {
  const source = fs.readFileSync(path.join(packageRoot, file), 'utf8');

  for (const [, body] of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const prose = body
      .split('\n')
      .map((line) => line.replace(/^\s*\* ?/, ''))
      .join('\n');
    const example = /@example\n([\s\S]*?)(?=\n@|$)/.exec(prose);

    if (example) snippets.push([null, 'javascript', example[1].trim()]);
  }
}

function checkedSource(source) {
  return source
    .split('\n')
    .map((line) => {
      const result = /^(.*?)\s+\/\/ => (.+)$/.exec(line);

      if (!result) {
        return line;
      }

      const statement = result[1].trim().replace(/;$/, '');
      const error = /^throws ([A-Za-z_$][\w$]*)$/.exec(result[2]);

      if (error) {
        return `__assertThrows(() => { ${statement}; }, ${JSON.stringify(error[1])});`;
      }

      if (/^console\.log\(/.test(statement)) {
        return `__assertPrinted(() => { ${statement}; }, (${result[2]}));`;
      }

      const declaration = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(statement);

      if (declaration) {
        return `${statement}; __assertEqual(${declaration[1]}, (${result[2]}));`;
      }

      return `__assertEqual((${statement}), (${result[2]}));`;
    })
    .join('\n');
}

function runExample(source, globals = {}) {
  const actual = [];
  let checked = 0;
  const context = vm.createContext({
    Constant,
    console: {
      log(value) {
        actual.push(value);
      }
    },
    __assertThrows(callback, name) {
      assert.throws(callback, (error) => error.name === name);
    },
    __assertEqual(left, right) {
      assert.deepEqual(structuredClone(left), structuredClone(right));
    },
    __assertPrinted(callback, expected) {
      const before = actual.length;

      callback();
      assert.equal(actual.length, before + 1, 'Expected one console output');
      assert.deepEqual(structuredClone(actual[before]), structuredClone(expected));
      checked++;
    },
    ...globals
  });

  new vm.Script('"use strict";\n' + checkedSource(source)).runInContext(context, { timeout: 1000 });
  assert.ok(source.includes('// =>'), 'Examples must have asserted results.');
  assert.equal(actual.length, checked, 'Every printed result needs an assertion');
}

test('README includes executable examples for the public record and registry APIs', () => {
  assert.ok(snippets.length >= 10);

  for (const api of [
    'Constant(',
    'Constant.defineType(',
    'defineEnum(',
    '.fromValue(',
    '.hasValue(',
    '.getInstances()',
    '.valueOf()',
    'new Constant('
  ]) {
    assert.ok(
      snippets.some((match) => match[2].includes(api)),
      `Missing usage example for ${api}`
    );
  }
});

test('example checks reject incorrect values and missing or wrong exceptions', () => {
  assert.throws(() => runExample('console.log(false); // => true'), assert.AssertionError);
  assert.throws(() => runExample('Constant(1); // => throws TypeError'), assert.AssertionError);
  assert.throws(() => runExample('throw new RangeError("wrong"); // => throws TypeError'), assert.AssertionError);

  runExample('Constant.defineType().getInstances(); // => throws Error');
});

for (const [i, [, language, source]] of snippets.entries()) {
  test(`README ${language} example ${i + 1} produces its documented results`, () => {
    if (language === 'mjs' || /^import /m.test(source)) {
      const program = `import assert from "node:assert/strict";
let printed = 0;
let checked = 0;
let last;
const console = { log(value) { printed++; last = value; } };
const __assertEqual = (left, right) => assert.deepEqual(left, right);
const __assertThrows = (callback, name) => assert.throws(callback, error => error.name === name);
const __assertPrinted = (callback, expected) => { const before = printed; callback(); assert.equal(printed, before + 1); assert.deepEqual(last, expected); checked++; };
${checkedSource(source)}
assert.equal(printed, checked);`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
        cwd: packageRoot,
        encoding: 'utf8',
        timeout: 10000
      });

      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } else if (language === 'html') {
      const bundle = /<script src="([^"]+)"><\/script>/.exec(source);

      assert.ok(bundle, 'Browser example must identify its bundle.');

      const globals = {};
      const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      const cdnPrefix = 'https://cdn.jsdelivr.net/npm/' + metadata.name + '@' + metadata.version + '/';

      vm.runInNewContext(fs.readFileSync(path.join(packageRoot, bundle[1].replace(cdnPrefix, '')), 'utf8'), globals);
      const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

      assert.ok(scripts.length, 'Browser example must contain executable code.');

      runExample(scripts.join('\n'), { goConstant: globals.goConstant });
    } else {
      runExample(source, {
        require(name) {
          assert.equal(name, 'go-constant');

          return packageRequire(name);
        }
      });
    }
  });
}
