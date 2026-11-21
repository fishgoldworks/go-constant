'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const defineType = require('./helpers/library.js').defineType;

function ownFields(value) {
  return Reflect.ownKeys(value);
}

test('call/apply receivers cannot reinitialize an existing instance', () => {
  const Type = defineType('Pair', ['left', 'right']);
  const existing = Type(1, 2);
  const other = Type.call(existing, 3, 4);

  assert.notEqual(other, existing);
  assert.deepEqual([other.left, other.right], [3, 4]);
  assert.deepEqual([existing.left, existing.right], [1, 2]);
});

test('omitted and null schemas still construct empty records', () => {
  for (const fields of [undefined, null, []]) {
    const Type = defineType('Empty', fields);

    assert.deepEqual(ownFields(Type(1, 2)), []);
  }
});

for (const fields of ['code', {}, 1, true, () => {}, new Set(['code'])]) {
  test(`rejects non-array fields: ${typeof fields}`, () => {
    assert.throws(() => defineType('Invalid', fields), /fields.*array/i);
  });
}

for (const key of [undefined, null, 1, {}, [], () => {}]) {
  test(`rejects invalid field key: ${String(key)}`, () => {
    assert.throws(() => defineType('Invalid', [key]), /field.*string.*symbol/i);
  });
}

test('rejects holes even when an array prototype supplies a value', () => {
  const fields = new Array(1);
  const prototype = Object.create(Array.prototype);

  prototype[0] = 'inherited';
  Object.setPrototypeOf(fields, prototype);

  assert.throws(() => defineType('Invalid', fields), /dense|sparse|hole/i);
});

test('rejects duplicate string and symbol keys at definition time', () => {
  const symbol = Symbol('same');

  for (const fields of [
    ['code', 'code'],
    [symbol, symbol]
  ]) {
    assert.throws(() => defineType('Invalid', fields), /duplicate/i);
  }
});

test('accepts distinct symbols with the same description', () => {
  const left = Symbol('code'),
    right = Symbol('code');
  const Type = defineType('Symbols', [left, right]);
  const instance = Type(1, 2);

  assert.equal(instance[left], 1);
  assert.equal(instance[right], 2);
  assert.deepEqual(ownFields(instance), [left, right]);
});

test('supports unusual string keys and defines __proto__ as data', () => {
  const fields = ['__proto__', 'constructor', '', 'two words', '0'];
  const Type = defineType('Keys', fields);
  const instance = Type(null, 'data', 3, 4, 5);

  assert.equal(Object.getPrototypeOf(instance), Type.prototype);
  assert.equal(instance.__proto__, null);
  assert.equal(instance.constructor, 'data');
  assert.equal(instance['two words'], 4);
  assert.equal(instance['0'], 5);
  assert.equal({}.polluted, undefined);
});

test('copies field names so later edits cannot change the schema', () => {
  const fields = ['code', 'label'];
  const Type = defineType('Status', fields);

  fields[0] = 'changed';
  fields.push('extra');
  const instance = Type('ok', 'Okay', true);

  assert.deepEqual(ownFields(instance), ['code', 'label']);
  assert.equal(instance.code, 'ok');
});

test('accepts frozen arrays and options without modifying either', () => {
  const fields = Object.freeze(['code']);
  const options = Object.freeze({ valueOf: 'code', trackInstances: true });
  const Type = defineType('Code', fields, options);

  assert.equal(Type(1).valueOf(), 1);
  assert.equal(Object.isFrozen(fields), true);
  assert.equal(Object.isFrozen(options), true);
});

test('missing fields become own undefined properties and extra args stay available to validation', () => {
  let seen;
  const Type = defineType('Pair', ['left', 'right'], {
    validate(...args) {
      seen = args;
    }
  });
  const first = Type(1);

  assert.deepEqual(ownFields(first), ['left', 'right']);
  assert.equal(first.right, undefined);

  const second = Type(1, 2, 3);

  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(ownFields(second), ['left', 'right']);
});

for (const options of [false, true, 1, 'options', [], () => {}]) {
  test(`rejects invalid options: ${typeof options}`, () => {
    assert.throws(() => defineType('Invalid', [], options), /options.*object/i);
  });
}

test('missing/null options and null-prototype options work', () => {
  for (const options of [undefined, null, Object.create(null)]) {
    const Type = defineType('Type', ['code'], options);

    assert.equal(Type(1).code, 1);
    assert.equal(Object.hasOwn(Type.prototype, 'valueOf'), false);
  }
});

test('inherited options are ignored, including Object.prototype.valueOf', () => {
  const options = Object.create({ validate: true, valueOf: 'missing', trackInstances: true });
  const Type = defineType('Type', ['code'], options);
  const instance = Type(1);

  assert.equal(instance.code, 1);
  assert.equal(instance.valueOf(), instance);
  assert.equal(Object.hasOwn(Type.prototype, 'valueOf'), false);
  assert.equal(Type.instances, undefined);
});

test('each option getter is read once at type definition', () => {
  const reads = { validate: 0, valueOf: 0, trackInstances: 0 };
  const options = {
    get validate() {
      reads.validate++;

      return (value) => [value];
    },
    get valueOf() {
      reads.valueOf++;

      return 'code';
    },
    get trackInstances() {
      reads.trackInstances++;

      return true;
    }
  };
  const Type = defineType('Code', ['code'], options);

  Type(1).valueOf();
  Type(2).valueOf();

  assert.deepEqual(reads, { validate: 1, valueOf: 1, trackInstances: 1 });
});

test('mutating validator and value selector options has no effect', () => {
  const options = { validate: (value) => [Number(value), 'label'], valueOf: 'code' };
  const Type = defineType('Code', ['code', 'label'], options);
  const one = Type('1');

  options.valueOf = 'label';
  options.validate = false;

  assert.equal(one.valueOf(), 1);
  assert.equal(Type('2').code, 2);
});

for (const validate of [true, false, 'validate', 1, {}, []]) {
  test(`rejects invalid validator: ${String(validate)}`, () => {
    assert.throws(() => defineType('Invalid', [], { validate }), /validate.*function/i);
  });
}

test('null and undefined validators mean no validation', () => {
  for (const validate of [undefined, null]) {
    assert.equal(defineType('Type', ['code'], { validate })(1).code, 1);
  }
});

test('validator receives a fresh instance as this before declared fields exist', () => {
  let receiver;
  const Type = defineType('Code', ['code'], {
    validate(value) {
      receiver = this;

      assert.equal(Object.hasOwn(this, 'code'), false);

      this.extra = true;

      return [Number(value)];
    }
  });
  const result = Type('1');

  assert.equal(receiver, result);
  assert.equal(result instanceof Type, true);
  assert.equal(result.extra, true);
  assert.equal(result.code, 1);
});

test('validator may return undefined, shorter arrays, frozen arrays and cross-realm arrays', () => {
  for (const returned of [undefined, [], [5], Object.freeze([5, 6]), vm.runInNewContext('[5, 6]')]) {
    const Type = defineType('Pair', ['left', 'right'], {
      validate() {
        return returned;
      }
    });
    const result = Type(1, 2);

    assert.equal(result.left, returned === undefined ? 1 : returned[0]);
    assert.equal(result.right, returned === undefined ? 2 : returned[1]);
  }
});

for (const [label, result] of [
  ['boolean true', true],
  ['boolean false', false],
  ['null', null],
  ['number', 1],
  ['string', 'ab'],
  ['object', { 0: 'x', length: 1 }],
  ['typed array', new Uint8Array([1])],
  ['promise', Promise.resolve([1])],
  ['function', () => {}],
  ['symbol', Symbol('x')]
]) {
  test(`rejects unsupported validator return: ${label}`, () => {
    const Type = defineType('Invalid', ['code'], {
      validate() {
        return result;
      }
    });

    assert.throws(() => Type(1), /validate.*(array|undefined)/i);
  });
}

test('ordinary thenable results are rejected without invoking then', () => {
  let invoked = false;
  const Type = defineType('Invalid', ['code'], {
    validate() {
      return {
        then() {
          invoked = true;
        }
      };
    }
  });

  assert.throws(() => Type(1), TypeError);
  assert.equal(invoked, false);
});

test('validator exceptions are propagated by identity', () => {
  const error = new RangeError('Invalid code');
  const Type = defineType('Type', ['code'], {
    validate() {
      throw error;
    }
  });

  assert.throws(
    () => Type(1),
    (actual) => actual === error
  );
  assert.throws(
    () => new Type(1),
    (actual) => actual === error
  );
});

test('supports string/symbol value selectors and callbacks', () => {
  const symbol = Symbol('code');
  const BySymbol = defineType('Symbol', [symbol], { valueOf: symbol });

  assert.equal(BySymbol(4).valueOf(), 4);

  const ByCallback = defineType('Code', ['code'], {
    valueOf() {
      return this.code + 1;
    }
  });

  assert.equal(ByCallback(4).valueOf(), 5);
});

for (const valueOf of [true, false, 1, {}, [], 'missing', Symbol('missing')]) {
  test(`rejects invalid value selector: ${String(valueOf)}`, () => {
    assert.throws(() => defineType('Invalid', ['code'], { valueOf }), /valueOf/i);
  });
}

test('rejects valueOf field collisions only when a coercion option is configured', () => {
  assert.equal(defineType('Data', ['valueOf'])(123).valueOf, 123);

  for (const valueOf of ['valueOf', () => 1]) {
    assert.throws(() => defineType('Invalid', ['valueOf'], { valueOf }), /valueOf.*field|field.*valueOf/i);
  }
});

test('valueOf callback errors are propagated unchanged', () => {
  const error = new Error('callback failure');
  const Type = defineType('Code', [], {
    valueOf() {
      throw error;
    }
  });

  assert.throws(
    () => Type().valueOf(),
    (actual) => actual === error
  );
});

test('type names are stringified once and protected', () => {
  let calls = 0;
  const name = {
    toString() {
      calls++;

      return 'Name with spaces';
    }
  };
  const Type = defineType(name, []);

  Type();
  Type();

  assert.equal(calls, 1);
  assert.equal(Type.name, 'Name with spaces');
  assert.equal(defineType(1).name, '1');
  assert.equal(defineType(null).name, 'ConstantType');
  assert.throws(() => {
    Type.name = 'Other';
  }, TypeError);
});

test('native async validators are rejected before any asynchronous work starts', () => {
  let called = false;

  async function validate() {
    called = true;
    throw new Error('must not run');
  }

  for (const callback of [validate, validate.bind(null), vm.runInNewContext('(async function validate() {})')]) {
    assert.throws(() => defineType('Async', [], { validate: callback }), /validate.*synchronous/i);
  }

  assert.equal(called, false);
});

test('generator validators are rejected because they do not validate synchronously', () => {
  for (const validate of [
    function* () {
      yield 1;
    },
    async function* () {
      yield 1;
    }
  ]) {
    assert.throws(() => defineType('Generator', [], { validate }), /validate.*synchronous/i);
  }
});

for (const key of ['trackInstance', 'validator', 'toString', 'constructor', '__proto__', '', Symbol('unknown')]) {
  test(`rejects unknown own option key before construction: ${String(key)}`, () => {
    const options = Object.create(null);

    Object.defineProperty(options, key, { value: true, enumerable: true });

    assert.throws(
      () => defineType('Typo', ['code'], options),
      (error) =>
        error instanceof TypeError && error.message.includes('Unknown option') && error.message.includes(String(key))
    );
  });
}

test('unknown non-enumerable options also fail early', () => {
  const options = Object.defineProperty({}, 'trackInstance', { value: true });

  assert.throws(() => defineType('Typo', [], options), /Unknown option.*trackInstance/);
});

test('rejects unknown options without reading any option accessors', () => {
  let reads = 0;
  const options = {
    get validate() {
      reads++;
      throw new Error('must not read');
    },
    get trackInstance() {
      reads++;
      throw new Error('must not read');
    }
  };

  assert.throws(() => defineType('Typo', [], options), /Unknown option.*trackInstance/);
  assert.equal(reads, 0);
});

test('ignores inherited unknown keys without evaluating them', () => {
  const prototype = {
    get metadata() {
      throw new Error('must not read');
    }
  };
  const options = Object.assign(Object.create(prototype), { trackInstances: true });
  const Type = defineType('Inherited', ['code'], options);
  const item = Type('ok');

  assert.equal(Type.getInstances()[0], item);
});

test('accepts recognized non-enumerable option keys', () => {
  const options = Object.defineProperty({}, 'trackInstances', { value: true });
  const Type = defineType('Hidden', ['code'], options);
  const item = Type('ok');

  assert.equal(Type.getInstances()[0], item);
});

test("different same-shaped constructors do not reuse each other's records", () => {
  const A = defineType('A', ['code']);
  const B = defineType('B', ['code']);
  const a = A('alpha');
  const b = B(a);

  assert.notEqual(a, b);
  assert.equal(b.code, a);
  assert.equal(A(a), a);
});

test('named inputs provide defaults and normalize exactly once before tracking', () => {
  let calls = 0;
  const Delivery = defineType('Delivery', ['code', 'minDays', 'maxDays'], {
    trackInstances: true,
    validate({ code, minDays = 1, maxDays = 3 }) {
      calls++;
      if (typeof code !== 'string') throw new TypeError('code must be a string');
      if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays) {
        throw new RangeError('invalid day range');
      }

      return [code.trim().toLowerCase(), minDays, maxDays];
    }
  });
  const input = { code: ' COURIER ' };
  const item = Delivery(input);

  assert.deepEqual({ ...item }, { code: 'courier', minDays: 1, maxDays: 3 });
  assert.deepEqual(input, { code: ' COURIER ' });
  assert.equal(Delivery(item), item);
  assert.equal(calls, 1);
  assert.equal(Delivery.getInstances()[0], item);
  assert.throws(() => Delivery({ code: 'bad', minDays: 3, maxDays: 1 }), RangeError);
  assert.throws(() => Delivery({ code: 'bad', minDays: -1 }), RangeError);
  assert.throws(() => Delivery({ code: 12 }), TypeError);
  assert.equal(Delivery.getInstances().length, 1);
});

test('normalization may change arity rather than map input fields', () => {
  const Window = defineType('Window', ['start', 'end'], {
    validate(text) {
      return text.split(',').map(Number);
    }
  });

  assert.deepEqual({ ...Window('9,17') }, { start: 9, end: 17 });
  assert.throws(() => Window(9, 17), TypeError);
});
