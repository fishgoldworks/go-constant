'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const Constant = require('./helpers/library.js');
const { defineType } = Constant;

const invocations = [
  ['factory', (Type, args) => Type(...args)],
  ['new', (Type, args) => new Type(...args)],
  ['call', (Type, args) => Type.call(null, ...args)],
  ['Reflect.apply', (Type, args) => Reflect.apply(Type, Object.freeze({}), args)],
  ['bound factory', (Type, args) => Type.bind({ ignored: true })(...args)],
  ['bound new', (Type, args) => new (Type.bind({ ignored: true }))(...args)],
  ['Reflect.construct', (Type, args) => Reflect.construct(Type, args)]
];

for (const [label, invoke] of invocations) {
  test(`${label}: callback runs once on the fresh instance with all input arguments`, () => {
    let receiver,
      args,
      calls = 0;
    const Type = defineType('Pair', ['left', 'right'], {
      trackInstances: true,
      validate(...input) {
        calls++;
        receiver = this;
        args = input;

        assert.deepEqual(Reflect.ownKeys(this), []);

        return [input[1], input[0]];
      }
    });
    const result = invoke(Type, [1, 2, 3]);

    assert.equal(receiver, result);
    assert.equal(Object.getPrototypeOf(result), Type.prototype);
    assert.equal(calls, 1);
    assert.deepEqual(args, [1, 2, 3]);
    assert.deepEqual({ ...result }, { left: 2, right: 1 });
    assert.deepEqual(Type.getInstances(), [result]);
  });
}

test('apply accepts array-like inputs and evaluates their accessors once', () => {
  const reads = [];
  const args = {
    get length() {
      reads.push('length');

      return 2;
    },
    get 0() {
      reads.push(0);

      return 1;
    },
    get 1() {
      reads.push(1);

      return 2;
    }
  };
  const Type = defineType('Pair', ['left', 'right']);

  assert.deepEqual({ ...Type.apply(null, args) }, { left: 1, right: 2 });
  assert.deepEqual(reads, ['length', 0, 1]);
});

test('factory call does not inspect an uncooperative call receiver', () => {
  const receiver = new Proxy(
    {},
    {
      get() {
        throw new Error('receiver get');
      },
      set() {
        throw new Error('receiver set');
      }
    }
  );

  assert.equal(Constant.call(receiver, 1).value, 1);
});

test('bound positional arguments retain order and prevent false reuse', () => {
  const first = Constant(1);
  const Bound = Constant.bind(null, first);

  assert.equal(Bound(), first);

  const wrapped = Bound('outer');

  assert.equal(wrapped.value, first);
  assert.equal(wrapped.name, 'outer');
  assert.notEqual(new Bound(), first);
});

test('a derived constructor receives its actual subclass prototype', () => {
  const Type = defineType('Base', ['value'], { trackInstances: true });

  class Derived extends Type {
    describe() {
      return this.value;
    }
  }
  const result = new Derived(7);

  assert.equal(result instanceof Derived, true);
  assert.equal(result instanceof Type, true);
  assert.equal(result.describe(), 7);
  assert.deepEqual(Type.getInstances(), [result]);
  assert.equal(Type(result), result);
  assert.equal(Derived.getInstances()[0], result);
});

test('Reflect.construct honors a different newTarget without changing registration', () => {
  const Type = defineType('Base', ['value'], { trackInstances: true });

  function Other() {}

  const result = Reflect.construct(Type, [7], Other);

  assert.equal(Object.getPrototypeOf(result), Other.prototype);
  assert.equal(result.value, 7);
  assert.equal(result instanceof Type, false);
  assert.deepEqual(Type.getInstances(), [result]);
});

test('ordinary construction tolerates frozen constructors and prototypes', () => {
  const Type = defineType('Frozen', ['value'], { trackInstances: true, valueOf: 'value' });

  Object.freeze(Type.prototype);
  Object.freeze(Type);

  assert.equal(Type(3).valueOf(), 3);
  assert.equal(new Type(4).valueOf(), 4);
  assert.equal(Type.getInstances().length, 2);
});

test('inherited field setters are not executed when own fields are initialized', () => {
  const Type = defineType('Setter', ['value']);

  Object.defineProperty(Type.prototype, 'value', {
    set() {
      throw new Error('prototype setter');
    }
  });

  assert.equal(Type(3).value, 3);
});

test('normalization uses Reflect.apply rather than user-controlled call/apply methods', () => {
  function validate(value) {
    return [value * 2];
  }

  validate.call = validate.apply = () => {
    throw new Error('overridden helper');
  };

  const Type = defineType('Hook', ['value'], { validate });

  assert.equal(Type(3).value, 6);
});

test('a bound validator keeps its explicitly bound receiver', () => {
  const receiver = { prefix: 'code:' };

  function validate(value) {
    assert.equal(this, receiver);

    return [this.prefix + value];
  }

  const Type = defineType('BoundHook', ['code'], { validate: validate.bind(receiver) });

  assert.equal(Type('a').code, 'code:a');
});

test('an arrow validator retains its lexical receiver', () => {
  const receiver = {};
  const validate = function () {
    return (value) => {
      assert.equal(this, receiver);

      return [value];
    };
  }.call(receiver);

  assert.equal(defineType('Arrow', ['code'], { validate })(3).code, 3);
});

for (const [label, returned] of [
  ['readonly array', Object.freeze([1, 2])],
  ['sealed array', Object.seal([1, 2])],
  ['array subclass', new (class Values extends Array {})(1, 2)],
  ['foreign array', vm.runInNewContext('[1, 2]')]
]) {
  test(`normalized ${label} supplies fields without mutating the returned array`, () => {
    const before = Object.getOwnPropertyDescriptors(returned);
    const Type = defineType('Output', ['left', 'right'], {
      validate() {
        return returned;
      }
    });

    assert.deepEqual({ ...Type() }, { left: 1, right: 2 });
    assert.deepEqual(Object.getOwnPropertyDescriptors(returned), before);
  });
}

test('normalization reads only declared positions, once each and in order', () => {
  const reads = [],
    values = [1, 2, 3];
  const returned = new Proxy(values, {
    get(target, key) {
      reads.push(key);
      if (key !== '0' && key !== '1') throw new Error('unexpected access ' + String(key));

      return Reflect.get(target, key);
    }
  });
  const Type = defineType('Output', ['left', 'right'], {
    validate() {
      return returned;
    }
  });

  assert.deepEqual({ ...Type() }, { left: 1, right: 2 });
  assert.deepEqual(reads, ['0', '1']);
});

test('normalization copies slots but retains nested object references', () => {
  const object = { n: 1 },
    tuple = [object];
  const Type = defineType('Output', ['value'], {
    validate() {
      return tuple;
    }
  });
  const item = Type();

  tuple[0] = 'replacement';
  object.n = 2;

  assert.equal(item.value, object);
  assert.equal(item.value.n, 2);
});

test('normalized array holes become undefined own fields', () => {
  const Type = defineType('SparseOutput', ['left', 'right'], {
    validate() {
      // eslint-disable-next-line no-sparse-arrays -- Exercise a sparse input, not an explicit undefined element.
      return [, 2];
    }
  });
  const item = Type(9, 9);

  assert.equal(Object.hasOwn(item, 'left'), true);
  assert.equal(item.left, undefined);
  assert.equal(item.right, 2);
});

test('normalized array slots use normal property lookup, including inherited values', () => {
  const tuple = new Array(1);

  Object.setPrototypeOf(tuple, Object.assign(Object.create(Array.prototype), { 0: 'inherited' }));
  const Type = defineType('InheritedOutput', ['value'], {
    validate() {
      return tuple;
    }
  });

  assert.equal(Type().value, 'inherited');
});

for (const [label, returned] of [
  ['typed array', new Uint8Array([1])],
  ['Map', new Map()],
  ['Set', new Set()],
  ['iterator', [1].values()],
  ['boxed string', Object('ab')],
  ['array-like object', { 0: 1, length: 1 }],
  ['bigint', 1n],
  ['symbol', Symbol('x')],
  ['function', () => [1]],
  ['foreign object', vm.runInNewContext('({0:1,length:1})')]
]) {
  test(`normalization rejects ${label} without registering an instance`, () => {
    const Type = defineType('BadOutput', ['value'], {
      trackInstances: true,
      validate() {
        return returned;
      }
    });

    assert.throws(() => Type(1), /return undefined or an array/);
    assert.deepEqual(Type.getInstances(), []);
  });
}

test('then and iterator accessors on invalid outputs are never evaluated', () => {
  const returned = {
    get then() {
      throw new Error('then must not be read');
    },
    get [Symbol.iterator]() {
      throw new Error('iterator must not be read');
    }
  };
  const Type = defineType('Thenable', ['value'], {
    validate() {
      return returned;
    }
  });

  assert.throws(() => Type(1), /return undefined or an array/);
});

test('zero-field schemas still validate inputs and reject unsupported results', () => {
  let calls = 0;
  const Type = defineType('Empty', [], {
    trackInstances: true,
    validate(value) {
      calls++;
      if (!value) {
        return false;
      }

      return [];
    }
  });

  assert.throws(() => Type(false), /return undefined or an array/);

  const item = Type(true);

  assert.deepEqual(Reflect.ownKeys(item), []);
  assert.equal(calls, 2);
  assert.deepEqual(Type.getInstances(), [item]);
});

test('validator metadata cannot make a synchronous callback look asynchronous', () => {
  for (const tag of ['AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction']) {
    const validate = (value) => [value.trim()];

    Object.defineProperty(validate, Symbol.toStringTag, { value: tag });

    const Type = defineType('TaggedValidator', ['value'], { validate });

    assert.equal(Type(' item ').value, 'item');
  }
});

test('defining a type does not read a synchronous validator’s tag getter', () => {
  const validate = (value) => [value.trim()];

  Object.defineProperty(validate, Symbol.toStringTag, {
    get() {
      throw new Error('validator metadata must not be read');
    }
  });

  const Type = defineType('TaggedValidator', ['value'], { validate });

  assert.equal(Type(' item ').value, 'item');
});

test('a custom validator prototype cannot impersonate an async function prototype', () => {
  const validate = (value) => [value.trim()];
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const prototype = Object.create(Function.prototype, {
    constructor: { value: AsyncFunction },
    [Symbol.toStringTag]: { value: 'AsyncFunction' }
  });

  Object.setPrototypeOf(validate, prototype);

  const Type = defineType('CustomPrototype', ['value'], { validate });

  assert.equal(Type(' item ').value, 'item');
});

test('a cyclic proxy prototype still permits synchronous validation', () => {
  const validate = new Proxy((value) => [value.trim()], {
    getPrototypeOf() {
      return validate;
    }
  });
  const Type = defineType('ProxyValidator', ['value'], { validate });

  assert.equal(Type(' item ').value, 'item');
});

test('an opaque callable proxy can still validate a record', () => {
  const validate = new Proxy((value) => [value.trim()], {
    getPrototypeOf() {
      throw new Error('prototype is unavailable');
    }
  });
  const Type = defineType('OpaqueValidator', ['value'], { validate });

  assert.equal(Type(' item ').value, 'item');
});

test('a synchronous validator from another realm is accepted', () => {
  const validate = vm.runInNewContext('(value) => [value.trim()]');
  const Type = defineType('ForeignValidator', ['value'], { validate });

  assert.equal(Type(' item ').value, 'item');
});

test('a native async validator with a custom tag is rejected before invocation', () => {
  const validate = async () => {
    assert.fail('validator must not run');
  };

  Object.defineProperty(validate, Symbol.toStringTag, { value: 'Function' });

  assert.throws(() => defineType('UnsupportedHook', [], { validate }), /synchronous/);
});

for (const [label, makeHook] of [
  [
    'bound generator',
    () =>
      // eslint-disable-next-line require-yield -- Exercise an empty generator.
      function* () {
        throw new Error('body must not run');
      }.bind(null)
  ],
  ['bound async generator', () => async function* () {}.bind(null)],
  ['foreign async', () => vm.runInNewContext('(async function () {})')],
  ['foreign generator', () => vm.runInNewContext('(function* () {})')]
]) {
  test(`${label} validation is rejected at type definition`, () => {
    assert.throws(() => defineType('UnsupportedHook', [], { validate: makeHook() }), /synchronous/);
  });
}

for (const [label, thrown] of [
  ['undefined', undefined],
  ['null', null],
  ['zero', 0],
  ['string', 'rejected'],
  ['symbol', Symbol('error')],
  ['object', { failure: true }]
]) {
  test(`validator propagates thrown ${label} unchanged`, () => {
    const Type = defineType('Thrown', ['code'], {
      trackInstances: true,
      validate() {
        throw thrown;
      }
    });
    let caught = false;

    try {
      Type(1);
    } catch (error) {
      caught = true;

      assert.ok(Object.is(error, thrown));
    }

    assert.equal(caught, true);
    assert.deepEqual(Type.getInstances(), []);
  });
}

test('a validator can replace its configurable preinitialized field', () => {
  const Type = defineType('Preinitialized', ['code'], {
    validate() {
      Object.defineProperty(this, 'code', { value: 'temporary', configurable: true });

      return ['final'];
    }
  });
  const item = Type();

  assert.deepEqual(Object.getOwnPropertyDescriptor(item, 'code'), {
    value: 'final',
    writable: false,
    configurable: false,
    enumerable: true
  });
});

test('callback coercion uses the receiver supplied at invocation', () => {
  const Type = defineType('Coerced', ['value'], {
    valueOf() {
      return this.value;
    }
  });
  const item = Type(4);
  const method = item.valueOf;

  assert.equal(method.call({ value: 9 }), 9);
  assert.throws(() => method(), TypeError);
});

test('selector coercion also honors a borrowed receiver', () => {
  const Type = defineType('Selector', ['value'], { valueOf: 'value' });

  assert.equal(Type(4).valueOf.call({ value: 9 }), 9);
});

test('user errors from coercion do not undo successful registration', () => {
  const error = new Error('coercion failed');
  const Type = defineType('CoercionFailure', ['code'], {
    trackInstances: true,
    valueOf() {
      throw error;
    }
  });
  const item = Type(1);

  assert.throws(
    () => Number(item),
    (actual) => actual === error
  );
  assert.deepEqual(Type.getInstances(), [item]);
});

test('a declared Symbol.toPrimitive method follows ordinary JS coercion', () => {
  const hints = [];
  const Type = defineType('Primitive', [Symbol.toPrimitive, 'code'], { valueOf: 'code' });
  const item = Type(function (hint) {
    hints.push(hint);

    return hint === 'string' ? 'display' : 7;
  }, 99);

  assert.equal(Number(item), 7);
  assert.equal(String(item), 'display');
  assert.deepEqual(hints, ['number', 'string']);
  assert.equal(item.valueOf(), 99);
});

test('valueOf is ordinary callable data when normalization is used without a coercion option', () => {
  const fn = () => 11;
  const Type = defineType('ValueOfData', ['valueOf'], {
    validate(input) {
      return [input];
    }
  });
  const item = Type(fn);

  assert.equal(Object.hasOwn(Type.prototype, 'valueOf'), false);
  assert.equal(Object.hasOwn(item, 'valueOf'), true);
  assert.equal(item.valueOf, fn);
  assert.equal(item.valueOf(), 11);
});

test('name conversion errors propagate unchanged', () => {
  const error = new Error('bad name');
  const name = {
    toString() {
      throw error;
    }
  };

  assert.throws(
    () => Constant(1, name),
    (actual) => actual === error
  );
  assert.throws(
    () => defineType(name, []),
    (actual) => actual === error
  );
});
