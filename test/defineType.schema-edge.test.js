'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { defineType } = require('./helpers/library.js');

test('schema arrays from another realm are accepted and copied', () => {
  const fields = vm.runInNewContext('["code", "label"]');
  const Type = defineType('Foreign', fields, { valueOf: 'code' });

  fields.reverse();
  fields.length = 0;

  assert.deepEqual({ ...Type(1, 'One') }, { code: 1, label: 'One' });
});

test('schema copying does not invoke an array subclass species or iterator', () => {
  class Fields extends Array {
    static get [Symbol.species]() {
      throw new Error('species must not run');
    }
    [Symbol.iterator]() {
      throw new Error('iterator must not run');
    }
    slice() {
      throw new Error('custom slice must not run');
    }
  }
  const Type = defineType('Subclass', new Fields('code', 'label'));

  assert.deepEqual({ ...Type(1, 'One') }, { code: 1, label: 'One' });
});

test('schema index accessors are read exactly once and not at construction', () => {
  let reads = 0;
  const fields = Object.defineProperty(['code'], 0, {
    get() {
      reads++;

      return 'code';
    }
  });
  const Type = defineType('ReadOnce', fields);

  Type(1);
  Type(2);

  assert.equal(reads, 1);
});

test('non-enumerable array indices are valid declared fields', () => {
  const fields = [];

  Object.defineProperty(fields, 0, { value: 'code', enumerable: false });

  assert.equal(defineType('HiddenIndex', fields)(3).code, 3);
});

test('a schema accessor deleting a later index exposes a rejected hole', () => {
  const fields = ['first', 'second'];

  Object.defineProperty(fields, 0, {
    get() {
      delete fields[1];

      return 'first';
    }
  });

  assert.throws(() => defineType('SparseAfterRead', fields), /dense|sparse/);
});

test('extra metadata on a schema array is not interpreted as another field', () => {
  const fields = ['code'];

  Object.defineProperty(fields, 'metadata', {
    get() {
      throw new Error('not an index');
    }
  });
  fields[Symbol('metadata')] = 'ignored';

  assert.deepEqual(Reflect.ownKeys(defineType('Metadata', fields)(3, 4)), ['code']);
});

for (const [label, key] of [
  ['false', false],
  ['true', true],
  ['NaN', NaN],
  ['bigint', 0n],
  ['boxed string', Object('code')],
  ['boxed symbol', Object(Symbol('code'))]
]) {
  test(`schema rejects non-property-key ${label} rather than coercing it`, () => {
    assert.throws(() => defineType('Invalid', [key]), /string or symbol/);
  });
}

test('duplicate global symbols are rejected by identity', () => {
  assert.throws(() => defineType('Duplicate', [Symbol.for('x'), Symbol.for('x')]), /Duplicate/);
});

test('string and symbol names with the same description remain independent', () => {
  const symbol = Symbol('code');
  const Type = defineType('Mixed', ['code', symbol, 'getInstances', 'instances', 'prototype', 'name']);
  const result = Type(1, 2, 3, 4, 5, 6);

  assert.deepEqual(Reflect.ownKeys(result), ['code', 'getInstances', 'instances', 'prototype', 'name', symbol]);
  assert.equal(result[symbol], 2);
  assert.equal(result.getInstances, 3);
  assert.equal(typeof Type.getInstances, 'function');
  assert.equal(Type.name, 'Mixed');
});

test('integer-like field names are assigned in schema order, not enumeration order', () => {
  const Type = defineType('NumericNames', ['10', '2', '01', '0']);
  const item = Type('ten', 'two', 'one', 'zero');

  assert.deepEqual(Object.keys(item), ['0', '2', '10', '01']);
  assert.deepEqual([item['10'], item['2'], item['01'], item['0']], ['ten', 'two', 'one', 'zero']);
});

test('symbols have protected enumerable descriptors but are omitted by JSON', () => {
  const symbol = Symbol('id');
  const Type = defineType('SymbolRecord', [symbol, 'code']);
  const item = Type(7, 'ok');

  assert.deepEqual(Object.getOwnPropertyDescriptor(item, symbol), {
    value: 7,
    writable: false,
    configurable: false,
    enumerable: true
  });
  assert.equal({ ...item }[symbol], 7);
  assert.equal(JSON.stringify(item), '{"code":"ok"}');
});

test('declaration does not normalize or merge visually similar Unicode keys', () => {
  const composed = 'é',
    decomposed = 'e\u0301';
  const item = defineType('Unicode', [composed, decomposed])(1, 2);

  assert.equal(item[composed], 1);
  assert.equal(item[decomposed], 2);
});

for (const stage of ['schema index', 'schema descriptor', 'options ownKeys', 'option descriptor', 'option getter']) {
  test(`${stage} exceptions propagate by identity`, () => {
    const error = new Error(stage);
    let fields = ['code'],
      options = {};

    if (stage === 'schema index')
      fields = new Proxy(fields, {
        get(target, key) {
          if (key === '0') throw error;

          return Reflect.get(target, key);
        }
      });
    if (stage === 'schema descriptor')
      fields = new Proxy(fields, {
        getOwnPropertyDescriptor() {
          throw error;
        }
      });
    if (stage === 'options ownKeys')
      options = new Proxy(
        {},
        {
          ownKeys() {
            throw error;
          }
        }
      );
    if (stage === 'option descriptor')
      options = new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw error;
          }
        }
      );
    if (stage === 'option getter')
      options = {
        get validate() {
          throw error;
        }
      };

    assert.throws(
      () => defineType('Throw', fields, options),
      (actual) => actual === error
    );
  });
}

test('revoked configuration proxies fail without constructing records', () => {
  const fields = Proxy.revocable(['code'], {});

  fields.revoke();

  assert.throws(() => defineType('Fields', fields.proxy), TypeError);

  const options = Proxy.revocable({}, {});

  options.revoke();

  assert.throws(() => defineType('Options', [], options.proxy), TypeError);
});

test('cross-realm option objects and synchronous hooks work together', () => {
  const options = vm.runInNewContext('({validate(value) {return [value * 2]}, valueOf:"code", trackInstances:true})');
  const Type = defineType('ForeignOptions', ['code'], options);
  const item = Type(3);

  assert.equal(item.valueOf(), 6);
  assert.deepEqual(Type.getInstances(), [item]);
});

test('all inherited known-option getters are ignored without evaluating them', () => {
  const prototype = Object.create(null);

  for (const key of ['validate', 'valueOf', 'trackInstances']) {
    Object.defineProperty(prototype, key, {
      get() {
        throw new Error('inherited ' + key);
      }
    });
  }

  const Type = defineType('Inherited', ['code'], Object.create(prototype));

  assert.equal(Type(2).code, 2);
  assert.throws(() => Type.getInstances(), /not enabled/);
});

test('own undefined and null options override inherited configured behavior', () => {
  const options = Object.create({
    validate() {
      throw new Error('inherited');
    },
    valueOf: 'code',
    trackInstances: true
  });

  Object.assign(options, { validate: null, valueOf: undefined, trackInstances: undefined });
  const Type = defineType('Own', ['code'], options),
    item = Type(2);

  assert.equal(item.valueOf(), item);
  assert.equal(Object.hasOwn(Type, 'instances'), false);
});

test('hidden unknown symbol options fail before any configured hook is read', () => {
  let reads = 0;
  const options = {
    get validate() {
      reads++;

      return () => undefined;
    }
  };

  Object.defineProperty(options, Symbol('metadata'), {
    get() {
      throw new Error('do not read');
    }
  });

  assert.throws(() => defineType('Unknown', [], options), /Unknown option/);
  assert.equal(reads, 0);
});

test('JSON __proto__ options are rejected without prototype changes', () => {
  const options = JSON.parse('{"__proto__":{"polluted":true}}');

  assert.throws(() => defineType('UnsafeOption', [], options), /Unknown option.*__proto__/);
  assert.equal(Object.getPrototypeOf(options), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('deleting all caller-owned configuration after definition changes nothing', () => {
  const fields = ['code'];
  const options = { validate: (x) => [x + 1], valueOf: 'code', trackInstances: true };
  const Type = defineType('Stable', fields, options);

  fields.length = 0;
  for (const key of Object.keys(options)) delete options[key];
  const item = Type(4);

  assert.equal(item.valueOf(), 5);
  assert.deepEqual(Type.getInstances(), [item]);
});

test('type name and static API descriptors cannot be deleted or reconfigured', () => {
  const Type = defineType('Protected', [], { trackInstances: true });

  for (const key of ['name', 'getInstances']) {
    assert.equal(Reflect.deleteProperty(Type, key), false);
    assert.equal(Reflect.set(Type, key, 'changed'), false);
    assert.throws(() => Object.defineProperty(Type, key, { configurable: true }), TypeError);
  }

  assert.deepEqual(Object.keys(Type), []);
});

test('ordinary attached named members are still caller-owned writable properties', () => {
  const Type = defineType('Open', ['code'], { trackInstances: true });
  const first = Type('first'),
    second = Type('second');

  Object.assign(Type, { MEMBER: first });
  Type.MEMBER = second;

  assert.equal(Type.MEMBER, second);

  delete Type.MEMBER;

  assert.deepEqual(Type.getInstances(), [first, second]);
});

test('inherited schema index getters do not fill holes or get evaluated', () => {
  let reads = 0;
  const prototype = Object.create(Array.prototype);

  Object.defineProperty(prototype, '0', {
    get() {
      reads++;

      return 'inherited';
    }
  });
  const fields = new Array(1);

  Object.setPrototypeOf(fields, prototype);

  assert.throws(() => defineType('OwnIndices', fields), /dense|sparse/);
  assert.equal(reads, 0);
});
