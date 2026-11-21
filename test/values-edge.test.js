'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const Constant = require('./helpers/library.js');

// Removing reference preservation, nullish naming, or descriptor protection must
// fail these checks. Case labels never inspect the user value under test.
const cycle = {};

cycle.self = cycle;
const buffer = new ArrayBuffer(8);
const cases = [
  ['true', true],
  ['negative zero', -0],
  ['negative infinity', -Infinity],
  ['NaN', NaN],
  ['empty string', ''],
  ['embedded NUL and Unicode', '\0한글🙂'],
  ['negative bigint', -9007199254740993n],
  ['global symbol', Symbol.for('constant-test')],
  ['null prototype', Object.create(null)],
  ['cyclic record', cycle],
  ['frozen object', Object.freeze({ n: 1 })],
  ['sealed object', Object.seal({ n: 1 })],
  // eslint-disable-next-line no-sparse-arrays -- Exercise a sparse input, not an explicit undefined element.
  ['sparse array', [, 2]],
  ['Date', new Date(0)],
  ['invalid Date', new Date(NaN)],
  ['RegExp', /hello/giu],
  ['Map', new Map([[1, 2]])],
  ['Set', new Set([1])],
  ['WeakMap', new WeakMap()],
  ['WeakSet', new WeakSet()],
  ['Error', new Error('retained')],
  ['ArrayBuffer', buffer],
  ['DataView', new DataView(buffer)],
  ['typed array', new Uint8Array(buffer)],
  ['boxed number', Object(-0)],
  ['boxed symbol', Object(Symbol('boxed'))],
  ['resolved Promise', Promise.resolve(1)],
  ['class constructor', class User {}],
  ['arrow', () => 1],
  ['foreign object', vm.runInNewContext('({ n: 1 })')],
  ['foreign function', vm.runInNewContext('(function foreign() {})')]
];

for (const [label, value] of cases) {
  test(`value boundary: ${label} is retained without coercion or copying`, () => {
    const instance = Constant(value, 'retained');

    assert.ok(Object.is(instance.value, value));
    assert.ok(Object.is(instance.valueOf(), value));

    // Keep failure diagnostics primitive: Node 22's TAP formatter cannot safely
    // serialize every opaque input (notably an invalid Date) inside an error.
    const descriptor = Object.getOwnPropertyDescriptor(instance, 'value');

    assert.ok(Object.is(descriptor.value, value));
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.enumerable, true);
    assert.equal(Object.getPrototypeOf(instance), Constant.prototype);
  });
}

test('uncooperative value accessors are never read while wrapping', () => {
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error('must not inspect value');
      }
    }
  );
  const item = Constant(value, 'opaque');

  assert.equal(item.value, value);
  assert.equal(item.valueOf(), value);
});

test('explicit construction can retain a revoked proxy without inspecting it', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});

  revoke();
  const item = new Constant(proxy, 'opaque');

  assert.equal(item.value, proxy);
  assert.equal(item.valueOf(), proxy);
  // Single-argument factory identity checking is prototype-based, not trap-free.
  assert.throws(() => Constant(proxy), TypeError);
});

for (const [label, value, expected] of [
  ['boxed false', Object(false), 'false'],
  ['boxed empty string', Object(''), ''],
  ['negative zero', -0, '0'],
  ['NaN', NaN, 'NaN'],
  ['infinity', Infinity, 'Infinity'],
  ['negative bigint', -1n, '-1'],
  ['array', ['a', 'b'], 'a,b'],
  ['unicode', '한글🙂', '한글🙂']
]) {
  test(`name boundary: ${label} follows String conversion`, () => {
    assert.equal(Constant(1, value).name, expected);
    assert.equal(Constant.defineType(value, []).name, expected);
  });
}

test('name primitive conversion receives a string hint exactly once', () => {
  const hints = [];
  const name = {
    [Symbol.toPrimitive](hint) {
      hints.push(hint);

      return 'Display';
    }
  };
  const Type = Constant.defineType(name, []);

  Type();
  Type();

  assert.deepEqual(hints, ['string']);
  assert.equal(Type.name, 'Display');
  assert.equal(Constant(1, name).name, 'Display');
  assert.deepEqual(hints, ['string', 'string']);
});

test('name conversion falls back from nonprimitive toString to valueOf', () => {
  const calls = [];
  const name = {
    toString() {
      calls.push('string');

      return {};
    },
    valueOf() {
      calls.push('value');

      return 7;
    }
  };

  assert.equal(Constant(1, name).name, '7');
  assert.deepEqual(calls, ['string', 'value']);
});

test('non-convertible names fail instead of being silently replaced', () => {
  for (const name of [
    Object.create(null),
    {
      [Symbol.toPrimitive]() {
        return {};
      }
    }
  ]) {
    assert.throws(() => Constant(1, name), TypeError);
    assert.throws(() => Constant.defineType(name, []), TypeError);
  }
});

test('unused extra arguments are not coerced by the wrapper', () => {
  const extra = {
    [Symbol.toPrimitive]() {
      throw new Error('unused');
    }
  };

  assert.equal(Constant(1, 'One', extra).value, 1);
});

test('sloppy-mode writes and deletes leave protected fields untouched', () => {
  const value = Constant(1, 'One');
  const context = vm.createContext({ value });

  vm.runInContext('value.value = 2; value.name = "Two"; delete value.value;', context);

  assert.equal(value.value, 1);
  assert.equal(value.name, 'One');
  assert.equal(Reflect.set(value, 'value', 3), false);
  assert.equal(Reflect.deleteProperty(value, 'name'), false);
});

test('identical redefinition is allowed but a changed value is rejected', () => {
  const value = Constant(NaN);

  Object.defineProperty(value, 'value', { value: NaN });

  assert.throws(() => Object.defineProperty(value, 'value', { value: 1 }), TypeError);

  const zero = Constant(-0);

  assert.throws(() => Object.defineProperty(zero, 'value', { value: 0 }), TypeError);
  assert.ok(Object.is(zero.value, -0));
});

test('freezing a wrapper leaves referenced collections usable', () => {
  const map = new Map();
  const value = Object.freeze(Constant(map));

  map.set('enabled', true);

  assert.equal(value.value.get('enabled'), true);
  assert.equal(Reflect.set(value, 'extra', 1), false);
});

test('wrapper coercion does not conflate primitive comparison and identity', () => {
  const number = Constant(4),
    duplicate = Constant(4);

  assert.equal(Number(number), 4);
  assert.equal(number + 1, 5);
  assert.equal(number == 4, true); // Intentional coercion contract.
  assert.notEqual(number, duplicate);
  assert.equal(new Set([number, duplicate]).size, 2);
  assert.equal(String(number), '[object Object]');
  assert.equal(Boolean(Constant(0)), true);
});

test('object-valued coercion uses ordinary JS fallback rather than deep unwrapping', () => {
  const inner = Constant(3);
  const outer = new Constant(inner);

  assert.equal(outer.valueOf(), inner);
  assert.ok(Number.isNaN(Number(outer)));
});

test('serialization keeps native undefined, symbol, bigint, and cycle boundaries', () => {
  assert.equal(JSON.stringify(Constant(undefined)), '{"name":null}');
  assert.equal(JSON.stringify(Constant(Symbol('x'))), '{"name":null}');
  assert.equal(JSON.stringify(Constant(NaN)), '{"value":null,"name":null}');
  assert.throws(() => JSON.stringify(Constant(1n)), TypeError);
  assert.throws(() => JSON.stringify(Constant(cycle)), TypeError);
});
