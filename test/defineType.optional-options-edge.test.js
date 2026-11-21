'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Constant = require('./helpers/library.js');

for (const [label, configuration, expected] of [
  ['absent configuration', undefined, 'abc'],
  ['null configuration', null, 'abc'],
  ['absent normalizer', {}, 'abc'],
  ['undefined normalizer', { validate: undefined }, 'abc'],
  ['null normalizer', { validate: null }, 'abc'],
  [
    'present normalizer',
    {
      validate(text) {
        return [text.length];
      }
    },
    3
  ]
]) {
  test(`optional configuration: ${label} preserves the correct field and coercion`, () => {
    const Type = Constant.defineType('Optional', ['code'], { ...configuration, valueOf: 'code' });
    const instance = Type('abc');

    assert.equal(instance.code, expected);
    assert.equal(instance.valueOf(), expected);
    assert.deepEqual(Object.getOwnPropertyDescriptor(instance, 'code'), {
      value: expected,
      writable: false,
      configurable: false,
      enumerable: true
    });
  });
}

test('optional configuration: custom coercion sees the actual normalized or original value', () => {
  for (const enabled of [false, true]) {
    const Type = Constant.defineType('Coercion', ['code'], {
      ...(enabled
        ? {
            validate(text) {
              return [text.length];
            }
          }
        : {}),
      valueOf() {
        return typeof this.code + ':' + this.code;
      }
    });

    assert.equal(Type('abc').valueOf(), enabled ? 'number:3' : 'string:abc');
  }
});

test('optional configuration: tracking requires an explicitly true flag', () => {
  for (const fields of [null, ['code']]) {
    for (const options of [undefined, null, {}, { trackInstances: undefined }, { trackInstances: false }]) {
      const Type = Constant.defineType('Untracked', fields, options);

      Type('abc');

      assert.equal(Object.hasOwn(Type, 'instances'), false);
      assert.throws(() => Type.getInstances(), { name: 'Error' });
    }

    const Type = Constant.defineType('Tracked', fields, { trackInstances: true });
    const instance = Type('abc');

    assert.deepEqual(Type.getInstances(), [instance]);
  }
});

test('optional configuration: own valueOf data fields need no null-option workaround', () => {
  for (const validate of [undefined, (text) => [text.length]]) {
    const Type = Constant.defineType('Data', ['valueOf'], { validate, trackInstances: true });
    const item = Type('abc');

    assert.equal(item.valueOf, validate ? 3 : 'abc');
    assert.equal(Object.hasOwn(item, 'valueOf'), true);
    assert.deepEqual(Type.getInstances(), [item]);
  }

  const fn = () => 17;
  const FunctionData = Constant.defineType('FunctionData', ['valueOf'], {
    validate(value) {
      return [value];
    }
  });
  const item = FunctionData(fn);

  assert.equal(item.valueOf, fn);
  assert.equal(item.valueOf(), 17);
});

test('optional configuration: true data-field/coercion collisions still fail early', () => {
  for (const valueOf of [
    'valueOf',
    function () {
      return 1;
    }
  ]) {
    assert.throws(
      () =>
        Constant.defineType('Collision', ['valueOf'], {
          validate(n) {
            return [n];
          },
          valueOf
        }),
      { name: 'TypeError' }
    );
  }
});

test('optional configuration: prototype options remain ignored rather than captured', () => {
  class Options {
    validate(text) {
      return [text.length];
    }
    valueOf() {
      return 1;
    }
    get trackInstances() {
      throw new Error('inherited accessor must not run');
    }
  }
  const Type = Constant.defineType('OwnOnly', ['code'], new Options());
  const item = Type('abc');

  assert.equal(item.code, 'abc');
  assert.equal(item.valueOf(), item);
  assert.throws(() => Type.getInstances(), { name: 'Error' });
});
