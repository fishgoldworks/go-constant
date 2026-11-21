'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtimeTests = require('./helpers/runtime-files.js');
const distribution = process.env.GO_CONSTANT_DIST_DIR || path.join(root, 'package/dist');
const { checkSourceMap } = require('../scripts/artifact-map.js');

for (const name of ['go-constant.js', 'go-constant.min.js']) {
  const filename = path.join(distribution, name);

  test(`${name}: passes the complete runtime contract suite`, () => {
    const env = { ...process.env, GO_CONSTANT_TEST_ENTRY: filename };

    // The parent test runner sets an internal child flag; do not leak it into
    // a separate runner, which must discover and report its own full suite.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...runtimeTests], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024
    });

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# fail 0/);

    const count = /# tests (\d+)/.exec(result.stdout);

    assert.ok(count && Number(count[1]) >= 419, result.stdout);
  });

  for (const mode of ['global', 'amd', 'worker', 'legacy-global', 'null-module']) {
    test(`${name}: ${mode} loading works without dynamic code generation`, () => {
      let exported;
      const sandbox = {};

      if (mode === 'null-module') sandbox.module = null;
      if (mode === 'amd') {
        sandbox.define = (deps, factory) => {
          assert.equal(deps.length, 0);

          exported = factory();
        };

        sandbox.define.amd = {};
      } else if (mode === 'worker') {
        sandbox.globalThis = undefined;
        sandbox.self = {};
      } else if (mode === 'legacy-global') {
        sandbox.globalThis = undefined;
      }

      const globalObject = sandbox.self || sandbox;
      const preservedConstant = {};

      globalObject.Constant = preservedConstant;
      const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

      new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInContext(context);

      assert.equal(globalObject.Constant, preservedConstant, 'Preserves an existing Constant global');

      const Constant = exported || globalObject.goConstant;

      assert.equal(typeof Constant, 'function');
      assert.equal(Constant.Constant, Constant);
      assert.equal(Constant.Constant(25).value, 25);

      if (mode === 'amd') {
        assert.equal('goConstant' in globalObject, false);
      }

      const value = Constant(12, 'Twelve');

      assert.equal(value.value, 12);
      assert.equal(value.name, 'Twelve');
      assert.equal(Constant(value), value);
      assert.equal(Object.getOwnPropertyDescriptor(value, 'value').writable, false);

      const Type = Constant.defineType('Priority', ['code', 'rank'], { trackInstances: true, valueOf: 'rank' });
      const item = Type('high', 3);

      assert.equal(item.valueOf(), 3);
      assert.equal(Type.getInstances()[0], item);

      Type.getInstances().length = 0;

      assert.equal(Type.getInstances().length, 1);
      assert.equal('instances' in Type, false);
      assert.equal('getInstances' in Constant, false);
      assert.equal(Object.prototype.propertyIsEnumerable.call(Type.prototype, 'valueOf'), false);
    });
  }
}

test('source maps preserve the readable bundle through composed minification', () => {
  checkSourceMap(distribution);
  const source = fs.readFileSync(path.join(distribution, 'go-constant.js'), 'utf8');

  assert.ok(source.includes('go-constant v' + require('../package.json').version));
});

test('source-map verification accepts line-ending conversion but rejects corrupt embedded source', (t) => {
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'go-constant-map-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const name of ['go-constant.js', 'go-constant.js.map', 'go-constant.min.js', 'go-constant.min.js.map']) {
    fs.copyFileSync(path.join(distribution, name), path.join(temporary, name));
  }

  const file = path.join(temporary, 'go-constant.min.js.map');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));

  map.sourcesContent[0] = map.sourcesContent[0].replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(file, JSON.stringify(map));
  checkSourceMap(temporary);
  map.sourcesContent[0] += '\n// corrupt source';
  fs.writeFileSync(file, JSON.stringify(map));

  assert.throws(() => checkSourceMap(temporary), /source map content must match/);
});

test('source-map verification rejects a minified map that bypasses the build map', (t) => {
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'go-constant-uncomposed-map-'));

  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const name of ['go-constant.js', 'go-constant.js.map', 'go-constant.min.js', 'go-constant.min.js.map']) {
    fs.copyFileSync(path.join(distribution, name), path.join(temporary, name));
  }

  const file = path.join(temporary, 'go-constant.min.js.map');
  const map = JSON.parse(fs.readFileSync(file));

  map.sources = ['go-constant.js'];
  map.sourcesContent = [fs.readFileSync(path.join(temporary, 'go-constant.js'), 'utf8')];
  fs.writeFileSync(file, JSON.stringify(map));
  assert.throws(() => checkSourceMap(temporary), /compose|build map/);
});

for (const name of ['go-constant.js', 'go-constant.min.js']) {
  test(`${name}: CommonJS takes precedence over AMD without overwriting a global`, () => {
    let amdCalls = 0;
    const preserved = { existing: true };
    const sandbox = {
      module: { exports: {} },
      goConstant: preserved,
      define() {
        amdCalls++;
      }
    };

    sandbox.define.amd = {};
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

    new vm.Script(fs.readFileSync(path.join(distribution, name), 'utf8')).runInContext(context);

    assert.equal(amdCalls, 0);
    assert.equal(sandbox.goConstant, preserved);
    assert.equal(sandbox.module.exports(5).value, 5);

    const symbol = Symbol('host field');
    const error = new Error('host validation error');
    const Type = sandbox.module.exports.defineType('CrossRealm', [symbol], {
      trackInstances: true,
      validate(value) {
        if (value < 0) throw error;

        return [value * 2];
      },
      valueOf: symbol
    });
    const item = Type(4);

    assert.equal(item.valueOf(), 8);
    assert.equal(Type.getInstances()[0], item);
    assert.throws(
      () => Type(-1),
      (actual) => actual === error
    );
    assert.equal(Type.getInstances().length, 1);
  });

  test(`${name}: independently loaded realms keep identity and registries separate`, () => {
    const code = fs.readFileSync(path.join(distribution, name), 'utf8');
    const first = {},
      second = {};

    for (const sandbox of [first, second]) {
      new vm.Script(code).runInContext(vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } }));

      assert.equal('Constant' in sandbox, false);
    }

    assert.notEqual(first.goConstant, second.goConstant);

    const inner = first.goConstant(7);
    const outer = second.goConstant(inner);

    assert.notEqual(inner, outer);
    assert.equal(outer.value, inner);
    assert.equal(first.goConstant(inner), inner);

    const A = first.goConstant.defineType('SameName', ['code'], { trackInstances: true });
    const B = second.goConstant.defineType('SameName', ['code'], { trackInstances: true });
    const a = A('a'),
      b = B('b');

    assert.equal(A.getInstances().length, 1);
    assert.equal(B.getInstances().length, 1);
    assert.equal(A.getInstances()[0], a);
    assert.equal(B.getInstances()[0], b);
    assert.equal(B(a).code, a);
    assert.equal(A.getInstances().length, 1);
    assert.equal(B.getInstances().length, 2);
  });
}
