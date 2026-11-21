'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { defineEnum, defineType } = require('./helpers/library');

test('enum names, enumeration and exact value lookups share the original members', () => {
  const Status = defineEnum({ 10: 'ten', 2: 'two', ZERO: -0, TEXT: '0', DRAFT: { value: 'draft', editable: true } });

  assert.deepEqual(Object.keys(Status), ['2', '10', 'ZERO', 'TEXT', 'DRAFT']);
  assert.deepEqual(Status.members, [Status[2], Status[10], Status.ZERO, Status.TEXT, Status.DRAFT]);
  assert.equal(Status.members, Status.members);
  assert.equal(Status.fromValue(0), Status.ZERO);
  assert.equal(Object.is(Status.ZERO.value, -0), true);
  assert.equal(Status.fromValue('0'), Status.TEXT);
  assert.equal(Status.fromValue('draft'), Status.DRAFT);
  assert.equal(Status.fromValue('Draft'), undefined);
  assert.equal(Status.hasValue(Status.DRAFT), false);
  assert.equal(Status.hasValue('draft'), true);
  assert.notEqual(defineEnum({ DRAFT: 'draft' }).DRAFT, Status.DRAFT);
  assert.deepEqual(defineEnum({}).members, []);
});

test('shallow protection applies to the enum output and leaves inputs editable', () => {
  const metadata = { label: 'Before' };
  const input = { ACTIVE: { value: 'active', metadata } };
  const Status = defineEnum(input);

  assert.ok(Object.isFrozen(Status) && Object.isFrozen(Status.ACTIVE) && Object.isFrozen(Status.members));
  assert.throws(() => {
    Status.ACTIVE.value = 'changed';
  }, TypeError);
  assert.throws(() => Status.members.pop(), TypeError);

  input.ACTIVE.value = 'changed';
  input.NEXT = 'next';
  metadata.label = 'After';

  assert.equal(Status.ACTIVE.value, 'active');
  assert.equal(Status.ACTIVE.metadata.label, 'After');
  assert.equal(Status.NEXT, undefined);
});

test('rejects direct record and class instance definitions even if frozen', () => {
  const Size = defineType('Size', ['value', 'width'], { valueOf: 'width' });
  const small = Size('small', 64);

  class Preset {
    constructor(value) {
      this.value = value;
    }
  }

  const frozen = Object.freeze(new Preset('small'));

  for (const definition of [small, frozen]) {
    assert.throws(() => defineEnum({ SMALL: definition }), {
      name: 'TypeError',
      message: /SMALL.*plain data object.*spread/
    });
  }

  assert.equal(Object.isFrozen(small), false);
});

test('rejects custom prototypes that declare a constructor property', () => {
  const accessor = Object.defineProperty(Object.create(null), 'constructor', {
    get() {
      throw new Error('prototype constructor getter ran');
    }
  });
  const lookalike = Object.assign(Object.create(null), { constructor: Object, label: 'Inherited' });

  for (const prototype of [accessor, lookalike]) {
    const definition = Object.assign(Object.create(prototype), { value: 'small' });

    assert.throws(() => defineEnum({ SMALL: definition }), /SMALL.*plain data object/);
  }
});

test('copies plain definitions from any realm, including frozen and null-prototype objects', () => {
  const small = Object.freeze(runInNewContext('({ value: "small", width: 64 })'));
  const large = Object.assign(Object.create(null), { value: 'large', width: 256 });
  const sizes = defineEnum({ SMALL: small, LARGE: large });

  assert.deepEqual(sizes.SMALL, { value: 'small', width: 64 });
  assert.deepEqual(sizes.LARGE, { value: 'large', width: 256 });
  assert.notEqual(sizes.SMALL, small);
  assert.notEqual(sizes.LARGE, large);
  assert.notEqual(defineEnum({ SMALL: small }).SMALL, sizes.SMALL);
});

test('uses explicit record copies as data and preserves records stored as metadata', () => {
  const Size = defineType('Size', ['value', 'width'], { valueOf: 'width' });
  const small = Size('small', 64);
  const large = Size('large', 256);
  const copied = defineEnum({ SMALL: { ...small }, LARGE: { ...large } });
  const referenced = defineEnum({
    SMALL: { value: small.value, preset: small },
    LARGE: { value: large.value, preset: large }
  });

  assert.deepEqual(copied.SMALL, { value: 'small', width: 64 });
  assert.equal(copied.fromValue('small'), copied.SMALL);
  assert.equal(copied.SMALL.valueOf(), copied.SMALL);
  assert.equal(referenced.SMALL.preset, small);
  assert.equal(referenced.SMALL.preset.valueOf(), 64);
  assert.equal(Object.isFrozen(referenced.SMALL), true);
  assert.equal(Object.isFrozen(small), false);
});

test('enum names are protected metadata and stay out of members and serialization', () => {
  const definitions = { ACTIVE: 'active' };
  const first = defineEnum(definitions, 'Status');
  const second = defineEnum(definitions, 'Status');

  assert.deepEqual(Object.getOwnPropertyDescriptor(first, 'name'), {
    value: 'Status',
    enumerable: false,
    writable: false,
    configurable: false
  });
  assert.deepEqual(Object.keys(first), ['ACTIVE']);
  assert.deepEqual(first.members, [first.ACTIVE]);
  assert.equal(first.fromValue('active'), first.ACTIVE);
  assert.equal(first.hasValue('Status'), false);
  assert.equal(JSON.stringify(first), '{"ACTIVE":{"value":"active"}}');
  assert.notEqual(first, second);
  assert.notEqual(first.ACTIVE, second.ACTIVE);
});

test('omitted and nullish enum names become null and other non-string names throw', () => {
  assert.equal(defineEnum({}).name, null);
  assert.equal(defineEnum({}, undefined).name, null);
  assert.equal(defineEnum({}, null).name, null);
  assert.equal(defineEnum({}, '').name, '');

  const objectName = {
    toString() {
      assert.fail('enum names must not be coerced');
    }
  };

  for (const name of [42, false, Symbol('Status'), objectName]) {
    assert.throws(() => defineEnum({}, name), TypeError);
  }

  assert.throws(() => defineEnum('Status', {}), TypeError);
});

test('reserves name only as a top-level member key', () => {
  assert.throws(() => defineEnum({ name: 'reserved' }), /Reserved enum member name: name/);
  assert.throws(() => defineEnum({ name: 'reserved' }, 'Field'), /Reserved enum member name: name/);
  assert.equal(defineEnum(Object.create({ name: 'inherited' })).name, null);

  const Field = defineEnum({ NAME: { value: 'name', name: 'Display name' } }, 'Field');

  assert.equal(Field.name, 'Field');
  assert.equal(Field.NAME.name, 'Display name');
  assert.equal(Field.fromValue('name'), Field.NAME);
});

test('duplicate values and reserved helper names fail with actionable errors', () => {
  assert.throws(() => defineEnum({ FIRST: 'a', SECOND: { value: 'a' } }), /FIRST.*SECOND/);
  assert.throws(() => defineEnum({ NEGATIVE: -0, ZERO: 0 }), /NEGATIVE.*ZERO/);
  assert.throws(() => defineEnum({ FIRST: 'a', SECOND: 'a' }, 'Status'), /Status.*FIRST.*SECOND/);

  for (const key of ['members', 'fromValue', 'hasValue']) {
    assert.throws(() => defineEnum({ [key]: 'reserved' }), new RegExp(key));
  }
});

test('rejects malformed values and unsupported properties without invoking getters', () => {
  assert.equal(typeof defineEnum, 'function');

  for (const value of [
    null,
    undefined,
    true,
    1n,
    NaN,
    Infinity,
    [],
    {},
    { value: null },
    Object.create({ value: 'inherited' })
  ]) {
    assert.throws(() => defineEnum({ BAD: value }), TypeError);
  }

  for (const invalid of [undefined, null, [], 'value', () => {}]) assert.throws(() => defineEnum(invalid), TypeError);

  const getter = {
    enumerable: true,
    get() {
      assert.fail('getter ran');
    }
  };
  const hidden = Object.defineProperty({}, 'hidden', { value: 'x' });
  const symbol = { [Symbol('unsupported')]: 'x' };

  assert.throws(() => defineEnum(Object.defineProperty({}, 'GETTER', getter)), TypeError);
  assert.throws(() => defineEnum({ BAD: Object.defineProperty({}, 'value', getter) }), TypeError);
  assert.throws(() => defineEnum({ BAD: Object.defineProperty({ value: 'x' }, 'label', getter) }), TypeError);

  for (const unsupported of [hidden, symbol]) assert.throws(() => defineEnum(unsupported), TypeError);

  assert.throws(() => defineEnum({ BAD: { value: 'x', ...symbol } }), TypeError);
  assert.throws(() => defineEnum({ BAD: Object.defineProperty({ value: 'x' }, 'hidden', { value: true }) }), TypeError);
  assert.throws(() => defineEnum(new Proxy({}, { ownKeys: () => ['missing'] })), /missing/);
});

test('copies safe own data and callback references without executing metadata', () => {
  const input = Object.create({ INHERITED: 'unused' });

  input.VALUE = JSON.parse('{"value":"safe","__proto__":{"polluted":true}}');
  let calls = 0;
  const compare = (a, b) => {
    calls++;

    return a - b;
  };

  input.VALUE.compare = compare;
  let serialisations = 0;

  input.VALUE.toJSON = () => {
    serialisations++;

    return 'safe';
  };

  Object.defineProperty(input, '__proto__', { value: 'named', enumerable: true });
  const Status = defineEnum(input);

  assert.equal(Status.INHERITED, undefined);
  assert.equal(Status.__proto__.value, 'named');
  assert.equal(Status.VALUE.__proto__.polluted, true);
  assert.equal(Status.VALUE.polluted, undefined);
  assert.equal(Status.VALUE.compare, compare);
  assert.equal(calls, 0);
  assert.equal(serialisations, 0);
  assert.equal(Status.VALUE.compare(4, 1), 3);
  assert.equal(JSON.stringify(Status.VALUE), '"safe"');
  assert.equal(serialisations, 1);
});
