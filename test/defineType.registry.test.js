'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const defineType = require('./helpers/library.js').defineType;

test('trackInstances enables tracking and the old option points to its replacement', () => {
  const Type = defineType('Tracked', ['code'], { trackInstances: true });
  const record = Type('example');

  assert.equal(Type.getInstances()[0], record);

  for (const saveInstances of [true, false, undefined]) {
    assert.throws(() => defineType('OldOption', [], { saveInstances }), {
      name: 'TypeError',
      message: 'Use trackInstances instead of saveInstances.'
    });
  }

  const options = {
    trackInstances: true,
    get saveInstances() {
      throw new Error('The old option must be rejected before its getter runs.');
    }
  };

  assert.throws(() => defineType('BothOptions', [], options), {
    name: 'TypeError',
    message: 'Use trackInstances instead of saveInstances.'
  });
});

test('getInstances returns fresh empty snapshots before construction', () => {
  const Type = defineType('Type', ['code'], { trackInstances: true });

  assert.deepEqual(Type.getInstances(), []);
  assert.notEqual(Type.getInstances(), Type.getInstances());
});

test('snapshots preserve successful construction order and references', () => {
  const Type = defineType('Priority', ['rank'], { trackInstances: true });
  const low = Type(1),
    high = new Type(3),
    mid = Type(2);
  const snapshot = Type.getInstances();

  assert.deepEqual(snapshot, [low, high, mid]);

  snapshot.sort((a, b) => b.rank - a.rank);
  snapshot[0] = 'unrelated';
  snapshot.push(null);
  snapshot.length = 0;

  assert.deepEqual(Type.getInstances(), [low, high, mid]);
});

test('later construction does not alter previous snapshots', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });
  const first = Type(1);
  const snapshot = Type.getInstances();

  Object.freeze(snapshot);
  Type(2);

  assert.deepEqual(snapshot, [first]);
  assert.equal(Type.getInstances().length, 2);
});

test('snapshots share instance references and mutable nested data', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });
  const value = Type({ enabled: false });

  Type.getInstances()[0].code.enabled = true;

  assert.equal(value.code.enabled, true);
});

test('tracked constructors leave the instances property available to callers', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });
  const value = Type(1);

  assert.equal(Object.hasOwn(Type, 'instances'), false);

  Type.instances = ['application data'];

  assert.deepEqual(Type.instances, ['application data']);
  assert.equal(Type.getInstances()[0], value);
  assert.equal(Type.getInstances().length, 1);
});

test('getInstances cannot be overwritten by attached static enum members', () => {
  const Type = defineType('Code', [], { trackInstances: true });

  assert.throws(() => Object.assign(Type, { getInstances: 'member' }), TypeError);
  assert.equal(Object.keys(Type).includes('getInstances'), false);
});

test('disabled tracking throws a plain Error with definition-time guidance', () => {
  for (const options of [undefined, {}, { trackInstances: false }]) {
    const Type = defineType('Code', ['code'], options);
    const expected = {
      constructor: Error,
      name: 'Error',
      message:
        'Cannot get instances of "Code": instance tracking was not enabled.\n' +
        'Define the type with { trackInstances: true } to collect instances.'
    };

    assert.throws(() => Type.getInstances(), expected);

    Type(1);

    assert.throws(() => Type.getInstances(), expected);
  }
});

for (const trackInstances of [null, 'true', 1, 0, [], {}]) {
  test(`tracking requires a boolean: ${String(trackInstances)}`, () => {
    assert.throws(() => defineType('Invalid', [], { trackInstances }), /trackInstances.*boolean/i);
  });
}

test('later changes to tracking configuration cannot enable or disable it', () => {
  for (const enabled of [true, false]) {
    const options = { trackInstances: enabled };
    const Type = defineType('Code', ['code'], options);

    options.trackInstances = !enabled;
    const result = Type(1);

    if (enabled) assert.deepEqual(Type.getInstances(), [result]);
    else assert.throws(() => Type.getInstances(), /not enabled/i);
  }
});

test('reusing an instance does not validate or register it a second time', () => {
  let calls = 0;
  const Type = defineType('Code', ['code'], {
    trackInstances: true,
    validate() {
      calls++;
    }
  });
  const first = Type(1);

  assert.equal(Type(first), first);
  assert.equal(calls, 1);
  assert.deepEqual(Type.getInstances(), [first]);
});

test('constructing equal data creates distinct registered records', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });
  const first = Type(1),
    second = Type(1);

  assert.notEqual(first, second);
  assert.deepEqual(Type.getInstances(), [first, second]);
});

test('failed validation and invalid validator returns are not registered', () => {
  const Type = defineType('Code', ['code'], {
    trackInstances: true,
    validate(value) {
      if (value === 0) throw new RangeError('invalid');
      if (value === 1) {
        return false;
      }
    }
  });

  assert.throws(() => Type(0), RangeError);
  assert.throws(() => Type(1), TypeError);

  const valid = Type(2);

  assert.deepEqual(Type.getInstances(), [valid]);
});

test('failed property initialization is not registered', () => {
  const Type = defineType('Pair', ['left', 'right'], {
    trackInstances: true,
    validate() {
      Object.defineProperty(this, 'right', { value: 'conflict' });

      return [1, 2];
    }
  });

  assert.throws(() => Type(), TypeError);
  assert.deepEqual(Type.getInstances(), []);
});

test('separate types have separate registries and detached readers work', () => {
  const First = defineType('First', ['code'], { trackInstances: true });
  const Second = defineType('Second', ['code'], { trackInstances: true });
  const first = First(1),
    second = Second(2);
  const getFirst = First.getInstances;

  assert.deepEqual(getFirst.call(Second), [first]);
  assert.deepEqual(Second.getInstances(), [second]);
});

test('freezing the constructor does not disable internal registration', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });

  Object.freeze(Type);
  const value = Type(1);

  assert.deepEqual(Type.getInstances(), [value]);
});

test('the factory shortcut remains prototype-based, not authenticity checking', () => {
  const Type = defineType('Code', ['code'], { trackInstances: true });
  const forged = Object.create(Type.prototype);

  assert.equal(Type(forged), forged);
  assert.deepEqual(Type.getInstances(), []);
});
