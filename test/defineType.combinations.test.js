'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { defineType } = require('./helpers/library.js');

// Full 2 × 3 × 3 × 2 × 3 = 108 combination matrix. This is exhaustive only
// over the five listed dimensions, not over all possible JavaScript inputs.
const schemas = [
  ['string', ['code', 'rank']],
  ['symbol', [Symbol('code'), Symbol('rank')]]
];
const modes = [
  ['factory', (Type, args) => Type(...args)],
  ['new', (Type, args) => new Type(...args)],
  ['apply', (Type, args) => Reflect.apply(Type, Object.freeze({}), args)]
];

for (const [schemaName, fields] of schemas) {
  for (const [modeName, invoke] of modes) {
    for (const normalization of ['absent', 'undefined', 'tuple']) {
      for (const tracking of [false, true]) {
        for (const coercion of ['absent', 'selector', 'callback']) {
          test(`matrix ${schemaName}/${modeName}/${normalization}/tracking=${tracking}/${coercion}`, () => {
            let calls = 0;
            const options = { trackInstances: tracking };

            if (normalization !== 'absent')
              options.validate = (code, rank) => {
                calls++;
                if (normalization === 'tuple') {
                  return [code.trim().toLowerCase(), rank * 10];
                }
              };

            if (coercion === 'selector') options.valueOf = fields[1];
            if (coercion === 'callback')
              options.valueOf = function () {
                return this[fields[1]] + 1;
              };

            const Type = defineType('Matrix', fields, options);
            const first = invoke(Type, [' HIGH ', 3]);
            const snapshot = tracking ? Type.getInstances() : null;
            const second = invoke(Type, [' LOW ', 1]);
            const expectedCode = normalization === 'tuple' ? 'high' : ' HIGH ';
            const expectedRank = normalization === 'tuple' ? 30 : 3;

            assert.equal(first[fields[0]], expectedCode);
            assert.equal(first[fields[1]], expectedRank);

            for (const field of fields) {
              const descriptor = Object.getOwnPropertyDescriptor(first, field);

              assert.equal(descriptor.writable, false);
              assert.equal(descriptor.configurable, false);
              assert.equal(descriptor.enumerable, true);
            }

            assert.equal(Type(first), first);
            assert.equal(calls, normalization === 'absent' ? 0 : 2);
            assert.equal(
              first.valueOf(),
              coercion === 'absent' ? first : expectedRank + (coercion === 'callback' ? 1 : 0)
            );
            assert.equal(Object.isExtensible(first), true);
            assert.equal(Object.getPrototypeOf(first), Type.prototype);

            if (tracking) {
              assert.deepEqual(snapshot, [first]);

              snapshot.reverse();
              snapshot.push('not a member');

              assert.deepEqual(Type.getInstances(), [first, second]);
              assert.notEqual(Type.getInstances(), snapshot);
            } else {
              assert.equal(Object.hasOwn(Type, 'instances'), false);
              assert.throws(() => Type.getInstances(), /not enabled/);
            }
          });
        }
      }
    }
  }
}

// Fixed-state xorshift generator: no Math.random, timeouts, or external services.
function random(seed) {
  let state = seed >>> 0;

  return (max) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;

    return (state >>> 0) % max;
  };
}

for (const seed of [0x12345678, 0xdeadbeef, 0x9e3779b9, 0x31415926]) {
  test(`seeded field/arity invariant seed=0x${seed.toString(16)} (64 cases)`, () => {
    const next = random(seed);
    const cycle = {};

    cycle.self = cycle;
    const pool = [
      undefined,
      null,
      false,
      true,
      0,
      -0,
      NaN,
      Infinity,
      '',
      '한글',
      7n,
      Symbol('value'),
      {},
      [],
      cycle,
      () => 1
    ];

    for (let trial = 0; trial < 64; trial++) {
      const label = `seed=${seed}, trial=${trial}`;
      const count = next(10),
        inputCount = next(13),
        normalizedCount = next(13);
      const fields = Array.from({ length: count }, (_, i) =>
        next(2)
          ? Symbol(`field:${i}`)
          : ['__proto__', '', '10', 'constructor', 'valueOf', 'two words', 'name', '0', 'e\u0301', 'é'][i]
      );
      const input = Array.from({ length: inputCount }, () => pool[next(pool.length)]);
      const normalized = Array.from({ length: normalizedCount }, () => pool[next(pool.length)]);
      const useNormalization = next(2) === 1;
      const Type = defineType(
        'Seeded',
        fields,
        useNormalization
          ? {
              validate() {
                return normalized;
              }
            }
          : undefined
      );
      const item = next(2) ? Reflect.construct(Type, input) : Reflect.apply(Type, null, input);
      const expected = useNormalization ? normalized : input;

      assert.equal(Reflect.ownKeys(item).length, count, label);

      for (let index = 0; index < fields.length; index++) {
        const field = fields[index];

        assert.ok(Object.is(item[field], expected[index]), `${label}, field=${index}`);
        assert.equal(Reflect.set(item, field, 'changed'), false, label);
        assert.equal(Reflect.deleteProperty(item, field), false, label);
      }

      assert.equal(Object.getPrototypeOf(item), Type.prototype, label);
      assert.equal({}.polluted, undefined, label);
    }
  });
}

for (const tracking of [false, true]) {
  test(`model-based lifecycle tracking=${tracking} (512 deterministic operations)`, () => {
    const seed = tracking ? 0xbadf00d : 0x1a2b3c4d;
    const next = random(seed),
      model = [],
      snapshots = [];
    const reject = Symbol('reject'),
      badOutput = Symbol('bad-output');
    const error = new Error('rejected');
    let expectedCalls = 0,
      calls = 0;
    const Type = defineType('Lifecycle', ['value'], {
      trackInstances: tracking,
      validate(value) {
        calls++;
        if (value === reject) throw error;
        if (value === badOutput) {
          return false;
        }

        return [value];
      }
    });

    for (let step = 0; step < 512; step++) {
      const label = `seed=${seed}, step=${step}`;
      const action = next(8);

      if (action < 2 || model.length === 0) {
        const input = next(8); // Deliberate duplicate data, distinct identities.
        const item = action === 0 ? Type(input) : new Type(input);

        expectedCalls++;
        model.push(item);

        assert.equal(item.value, input, label);
      } else if (action === 2) {
        const item = model[next(model.length)];

        assert.equal(Type(item), item, label);
      } else if (action === 3) {
        expectedCalls++;

        assert.throws(
          () => Type(reject),
          (actual) => actual === error,
          label
        );
      } else if (action === 4) {
        expectedCalls++;

        assert.throws(() => Type(badOutput), /return undefined or an array/, label);
      } else if (action === 5) {
        const existing = model[next(model.length)];
        const wrapped = Type(existing, 'force construction');

        expectedCalls++;
        model.push(wrapped);

        assert.equal(wrapped.value, existing, label);
      } else if (tracking) {
        const snapshot = Type.getInstances();
        const expected = model.slice();

        if (action === 6) {
          snapshot.length = 0;
          snapshot.push(null);
        } else {
          Object.freeze(snapshot);
          snapshots.push([snapshot, expected]);
        }
      } else {
        assert.throws(() => Type.getInstances(), /not enabled/, label);
      }

      assert.equal(calls, expectedCalls, label);

      if (tracking) assert.deepEqual(Type.getInstances(), model, label);
      else assert.equal(Type.instances, undefined, label);
    }

    for (const [actual, expected] of snapshots) assert.deepEqual(actual, expected);

    assert.equal(new Set(model).size, model.length);
  });
}
