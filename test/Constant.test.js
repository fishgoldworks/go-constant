'use strict';

const assert = require('node:assert/strict');
const { describe: suite, test } = require('node:test');

var Constant = require('./helpers/library.js');

suite('Constant', function () {
  test('does not expose instance tracking on the default constructor', function () {
    assert.equal('getInstances' in Constant, false);
  });

  suite('#constructor', function () {
    test('no arguments', function () {
      var level = new Constant();

      assert.equal(level.value, undefined);
      assert.equal(level.name, null);
    });

    test('value only', function () {
      var level = new Constant(1);

      assert.equal(level.value, 1);
      assert.equal(level.name, null);
    });

    var level = new Constant(1, 'foo');

    test('value and name', function () {
      assert.equal(level.value, 1);
      assert.equal(level.name, 'foo');
    });

    test('unmodifiable props', function () {
      assert.equal(level.value, 1);
      assert.equal(level.name, 'foo');

      assert.throws(function () {
        level.value = 2;
      }, TypeError);

      assert.equal(level.value, 1);

      assert.throws(function () {
        level.name = 'bar';
      }, TypeError);

      assert.equal(level.name, 'foo');
    });

    test('enumerable props', function () {
      var keys = Object.keys(level);

      assert.equal(keys.length, 2);
      assert(keys.includes('value'));
      assert(keys.includes('name'));
    });

    test('without new operator', function () {
      var level = Constant(1, 'foo');

      assert.equal(level.value, 1);
      assert.equal(level.name, 'foo');

      assert.equal(level, Constant(level));
    });
  });

  suite('#valueOf', function () {
    test('undefined', function () {
      var level = new Constant();

      assert.equal(level.valueOf(), undefined);
    });

    test('number', function () {
      var level = new Constant(1);

      assert.equal(level.valueOf(), 1);
      assert(level == 1);
    });

    test('string', function () {
      var level = new Constant('a');

      assert.equal(level.valueOf(), 'a');
      assert(level == 'a');
    });
  });
});

test('factory reuses only a single instance argument', () => {
  const existing = Constant(1, 'One');

  assert.equal(Constant(existing), existing);

  const wrapped = Constant(existing, 'Wrapper');

  assert.notEqual(wrapped, existing);
  assert.equal(wrapped.value, existing);
  assert.equal(wrapped.name, 'Wrapper');
});

test('an explicit undefined second argument prevents reuse', () => {
  const existing = Constant(1);
  const wrapped = Constant(existing, undefined);

  assert.notEqual(wrapped, existing);
  assert.equal(wrapped.value, existing);
});

test('new always constructs a fresh wrapper', () => {
  const existing = Constant(1);
  const wrapped = new Constant(existing);

  assert.notEqual(wrapped, existing);
  assert.equal(wrapped.value, existing);
});

test('arbitrary receivers are not modified by factory calls', () => {
  const receiver = {};
  const result = Constant.call(receiver, 1, 'One');

  assert.equal(result.value, 1);
  assert.deepEqual(receiver, {});
});

test('values and added fields remain mutable', () => {
  const nested = { enabled: false };
  const instance = Constant(nested);

  nested.enabled = true;
  instance.extra = 'metadata';

  assert.equal(instance.value.enabled, true);
  assert.equal(instance.extra, 'metadata');
  assert.equal(Object.isExtensible(instance), true);
});

test('declared fields cannot be deleted or reconfigured', () => {
  const value = Constant(1, 'One');

  assert.throws(() => {
    delete value.value;
  }, TypeError);
  assert.throws(() => Object.defineProperty(value, 'value', { writable: true }), TypeError);
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'value'), {
    value: 1,
    writable: false,
    configurable: false,
    enumerable: true
  });
});

test('String coercion and JSON keep the existing wrapper semantics', () => {
  const value = Constant(1, 'One');

  assert.equal(String(value), '[object Object]');
  assert.equal(JSON.stringify(value), '{"value":1,"name":"One"}');
  assert.equal(Boolean(Constant(false)), true);
});

for (const value of [null, undefined, false, 0, -0, NaN, Infinity, 1n, Symbol('value'), {}, [], () => 1]) {
  test(`Constant retains the exact value: ${String(value)}`, () => {
    const instance = Constant(value);

    assert.ok(Object.is(instance.value, value));
    assert.ok(Object.is(instance.valueOf(), value));
  });
}

for (const name of [undefined, null, '', 'Example', 0, false, 1n, Symbol('Example')]) {
  test(`Constant normalizes name: ${String(name)}`, () => {
    assert.equal(Constant(1, name).name, name == null ? null : String(name));
  });
}

test('prototype coercion method is not enumerable', () => {
  const instance = Constant(1, 'One');
  const keys = [];

  for (const key in instance) keys.push(key);

  assert.deepEqual(keys, ['value', 'name']);
  assert.equal(Object.getOwnPropertyDescriptor(Constant.prototype, 'valueOf').enumerable, false);
});

test('a spread copy of a wrapper is wrapped as a plain value', () => {
  const original = Constant(12, 'Twelve');
  const copy = { ...original };
  const result = Constant(copy);

  assert.equal(copy instanceof Constant, false);
  assert.equal(result.value, copy);
  assert.equal(result.value.value, 12);
  assert.equal(Constant(original), original);
});
