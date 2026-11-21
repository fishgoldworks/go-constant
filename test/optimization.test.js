'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Constant = require('./helpers/library.js');

// The generic equivalent is an executable specification for the specialized
// built-in wrapper. Tests assert observable behavior, never implementation text.
function equivalent() {
  return Constant.defineType('Constant', ['value', 'name'], {
    validate(value, name) {
      return [value, name == null ? null : String(name)];
    },
    valueOf: 'value'
  });
}

const modes = [
  ['factory', (T, args) => T(...args)],
  ['new', (T, args) => new T(...args)],
  ['bound', (T, args) => T.bind(Object.freeze({ untouched: true }))(...args)],
  ['Reflect.construct', (T, args) => Reflect.construct(T, args)]
];

for (const [label, invoke] of modes) {
  test(`wrapper fast path: ${label} matches generic descriptors, values, and extensibility`, () => {
    const Generic = equivalent();
    const object = Object.freeze({ keepIdentity: true });

    for (const args of [
      [],
      [undefined],
      [null],
      [false, 0],
      [NaN, false],
      [-0, ''],
      [0n, 123n],
      [object, Symbol('title')],
      [object, 'name', 'ignored']
    ]) {
      const fast = invoke(Constant, args),
        generic = invoke(Generic, args);

      assert.deepEqual(Object.getOwnPropertyDescriptors(fast), Object.getOwnPropertyDescriptors(generic));
      assert.equal(Object.getPrototypeOf(fast), Constant.prototype);
      assert.equal(Object.isExtensible(fast), true);
      assert.equal(fast.valueOf(), generic.valueOf());

      fast.additional = 1;

      assert.equal(fast.additional, 1);
    }
  });
}

test('wrapper fast path: failed name conversion aborts subclass initialization', () => {
  for (const Type of [Constant, equivalent()]) {
    // A name converter cannot directly inspect the under-construction object;
    // a subclass records this only after successful super(), which must not run.
    let afterSuper = false;
    const error = new Error('name conversion');

    class Derived extends Type {
      constructor() {
        super(1, {
          toString() {
            throw error;
          }
        });
        afterSuper = true;
      }
    }

    assert.throws(
      () => new Derived(),
      (caught) => caught === error
    );
    assert.equal(afterSuper, false);
  }
});

test('wrapper fast path: recursive name conversion does not mix inner and outer field values', () => {
  const inner = [];
  const name = {
    [Symbol.toPrimitive](hint) {
      assert.equal(hint, 'string');

      inner.push(Constant('inner', 123));

      return 'outer-name';
    }
  };
  const outer = Constant('outer', name);

  assert.deepEqual({ ...outer }, { value: 'outer', name: 'outer-name' });
  assert.deepEqual({ ...inner[0] }, { value: 'inner', name: '123' });
});

test('wrapper fast path: existing input is reused only for one factory argument', () => {
  const item = Constant(1, 'one');

  assert.equal(Constant(item), item);

  for (const result of [
    new Constant(item),
    Constant(item, undefined),
    Constant(item, 'wrapped'),
    new Constant(item, 'wrapped')
  ]) {
    assert.notEqual(result, item);
    assert.equal(result.value, item);
  }

  assert.equal(new Constant(item).name, null);
  assert.equal(Constant(item, undefined).name, null);
  assert.equal(Constant(item, 'wrapped').name, 'wrapped');
});

test('wrapper fast path: shared type statics and prototype descriptors match the generic equivalent', () => {
  const Generic = equivalent();

  assert.deepEqual(
    Reflect.ownKeys(Constant).filter((k) => !['Constant', 'defineType', 'defineEnum'].includes(k)),
    Reflect.ownKeys(Generic).filter((k) => k !== 'getInstances')
  );

  for (const key of ['length', 'name'])
    assert.deepEqual(Object.getOwnPropertyDescriptor(Constant, key), Object.getOwnPropertyDescriptor(Generic, key));
  const wrapperPrototype = Object.getOwnPropertyDescriptor(Constant, 'prototype');
  const genericPrototype = Object.getOwnPropertyDescriptor(Generic, 'prototype');

  for (const flag of ['writable', 'configurable', 'enumerable']) {
    assert.equal(wrapperPrototype[flag], genericPrototype[flag]);
  }

  const left = Object.getOwnPropertyDescriptor(Constant.prototype, 'valueOf'),
    right = Object.getOwnPropertyDescriptor(Generic.prototype, 'valueOf');

  for (const flag of ['writable', 'configurable', 'enumerable']) assert.equal(left[flag], right[flag]);

  assert.equal(left.value.length, right.value.length);
  assert.equal(left.value.name, right.value.name);
});

test('wrapper fast path: subclass construction and subclass instance reuse are preserved', () => {
  class Label extends Constant {
    describe() {
      return this.name + ':' + this.value;
    }
  }
  const result = new Label(7, 'seven');

  assert.equal(result.describe(), 'seven:7');
  assert.equal(result instanceof Label, true);
  assert.equal(Constant(result), result);
  assert.equal(new Label(result).value, result);
});

test('wrapper fast path: alternate newTarget receives fields without invoking inherited setters', () => {
  function Other() {}

  Object.defineProperties(Other.prototype, {
    value: {
      set() {
        throw Error('value setter');
      }
    },
    name: {
      set() {
        throw Error('name setter');
      }
    }
  });
  const result = Reflect.construct(Constant, [9, 'nine'], Other);

  assert.equal(Object.getPrototypeOf(result), Other.prototype);
  assert.deepEqual({ ...result }, { value: 9, name: 'nine' });
});

test('generic constructor preserves incremental field visibility to normalization getters', () => {
  const seen = [];
  const Type = Constant.defineType('Sequential', ['a', 'b', 'c'], {
    trackInstances: true,
    validate() {
      const self = this;

      return Object.defineProperties([], {
        0: {
          get() {
            seen.push(Reflect.ownKeys(self));

            return 'A';
          }
        },
        1: {
          get() {
            seen.push(Reflect.ownKeys(self));

            return self.a + 'B';
          }
        },
        2: {
          get() {
            seen.push(Reflect.ownKeys(self));

            return self.b + 'C';
          }
        }
      });
    }
  });
  const result = Type();

  assert.deepEqual(seen, [[], ['a'], ['a', 'b']]);
  assert.deepEqual({ ...result }, { a: 'A', b: 'AB', c: 'ABC' });
  assert.deepEqual(Type.getInstances(), [result]);
});

test('generic constructor tightens descriptors created by the validator', () => {
  const Type = Constant.defineType('Existing', ['code'], {
    validate(code) {
      Object.defineProperty(this, 'code', { value: 'old', writable: true, configurable: true, enumerable: false });

      return [code];
    }
  });

  assert.deepEqual(Object.getOwnPropertyDescriptor(Type('new'), 'code'), {
    value: 'new',
    writable: false,
    configurable: false,
    enumerable: true
  });
});

test('generated type metadata remains protected when constructor names collide with static members', () => {
  for (const name of ['name', 'length', 'getInstances', 'prototype', '__proto__']) {
    const Type = Constant.defineType(name, ['value'], { trackInstances: true });

    assert.equal(Type.name, name);

    const instance = Type(1);

    assert.deepEqual(Type.getInstances(), [instance]);
    assert.throws(() => {
      Type.name = 'other';
    }, TypeError);
    assert.throws(() => {
      Type.getInstances = () => [];
    }, TypeError);
  }
});
