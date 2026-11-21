'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { defineType } = require('./helpers/library.js');

test('a pending instance is absent from snapshots taken inside its validator', () => {
  let seen;
  const Type = defineType('Pending', ['value'], {
    trackInstances: true,
    validate() {
      seen = Type.getInstances();
    }
  });
  const first = Type(1),
    second = Type(2);

  assert.deepEqual(seen, [first]);
  assert.deepEqual(Type.getInstances(), [first, second]);
});

test('recursive successful construction registers in completion order', () => {
  let child;
  const Type = defineType('Recursive', ['value'], {
    trackInstances: true,
    validate(value) {
      if (value === 'parent') child = Type('child');
    }
  });
  const parent = Type('parent');

  assert.deepEqual(Type.getInstances(), [child, parent]);
});

test('a failed parent does not roll back a successfully constructed child', () => {
  let child;
  const error = new Error('parent failure');
  const Type = defineType('RecursiveFailure', ['value'], {
    trackInstances: true,
    validate(value) {
      if (value === 'parent') {
        child = Type('child');
        throw error;
      }
    }
  });

  assert.throws(
    () => Type('parent'),
    (actual) => actual === error
  );
  assert.deepEqual(Type.getInstances(), [child]);

  const later = Type('later');

  assert.deepEqual(Type.getInstances(), [child, later]);
});

test('a caught nested validation error does not prevent the parent from succeeding', () => {
  const Type = defineType('CaughtNested', ['value'], {
    trackInstances: true,
    validate(value) {
      if (value === 'invalid') throw new RangeError('invalid');
      if (value === 'parent') assert.throws(() => Type('invalid'), RangeError);
    }
  });
  const parent = Type('parent');

  assert.deepEqual(Type.getInstances(), [parent]);
});

for (const stage of ['first getter', 'later getter', 'revoked array', 'nonextensible receiver', 'conflicting field']) {
  test(`${stage}: failed initialization is unregistered and a later call can succeed`, () => {
    let escaped;
    const error = new Error(stage);
    const Type = defineType('AtomicRegistration', ['left', 'right'], {
      trackInstances: true,
      validate(fail) {
        escaped = this;
        if (!fail) {
          return [3, 4];
        }

        if (stage === 'revoked array') {
          const pair = Proxy.revocable([1, 2], {});

          pair.revoke();

          return pair.proxy;
        }

        if (stage === 'nonextensible receiver') {
          Object.preventExtensions(this);

          return [1, 2];
        }

        if (stage === 'conflicting field') {
          Object.defineProperty(this, 'right', { value: 99 });

          return [1, 2];
        }

        const pair = [1, 2];

        Object.defineProperty(pair, stage === 'first getter' ? 0 : 1, {
          get() {
            throw error;
          }
        });

        return pair;
      }
    });

    assert.throws(
      () => Type(true),
      (caught) => (stage.includes('getter') ? caught === error : caught instanceof TypeError)
    );

    const failed = escaped;

    assert.deepEqual(Type.getInstances(), []);

    // The library promises atomic registration, not rollback of user-observable
    // mutations to an instance captured by a callback.
    if (stage === 'later getter' || stage === 'conflicting field') assert.equal(failed.left, 1);
    const good = Type(false);

    assert.deepEqual({ ...good }, { left: 3, right: 4 });
    assert.deepEqual(Type.getInstances(), [good]);
    assert.notEqual(good, failed);
  });
}

test('a zero-field instance may be frozen by its hook and still registered', () => {
  const Type = defineType('FrozenEmpty', [], {
    trackInstances: true,
    validate() {
      Object.freeze(this);
    }
  });
  const item = Type();

  assert.equal(Object.isFrozen(item), true);
  assert.deepEqual(Type.getInstances(), [item]);
});

test('snapshot element descriptors remain ordinary mutable array descriptors', () => {
  const Type = defineType('Snapshot', ['value'], { trackInstances: true });
  const item = Type(1),
    snapshot = Type.getInstances();

  assert.equal(Array.isArray(snapshot), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(snapshot, '0'), {
    value: item,
    writable: true,
    configurable: true,
    enumerable: true
  });

  delete snapshot[0];
  Object.defineProperty(snapshot, 0, {
    get() {
      throw new Error('snapshot only');
    }
  });

  assert.equal(Type.getInstances()[0], item);
});

test('changing snapshot prototypes and mutator methods cannot affect the registry', () => {
  const Type = defineType('Isolated', ['value'], { trackInstances: true });
  const first = Type(1),
    snapshot = Type.getInstances();

  snapshot.push = () => {
    throw new Error('poisoned snapshot');
  };

  Object.setPrototypeOf(snapshot, null);
  const second = Type(2);

  assert.deepEqual(Type.getInstances(), [first, second]);
});

test('identically named type definitions retain independent registries', () => {
  const A = defineType('Same', ['value'], { trackInstances: true });
  const B = defineType('Same', ['value'], { trackInstances: true });
  const a = A(1),
    b = B(1);

  assert.notEqual(a, b);
  assert.deepEqual(A.getInstances(), [a]);
  assert.deepEqual(B.getInstances(), [b]);
});

test('getInstances errors use the captured display name rather than a later name conversion', () => {
  let reads = 0;
  const name = {
    toString() {
      reads++;

      return 'Named';
    }
  };
  const Type = defineType(name, []);

  name.toString = () => {
    throw new Error('should be captured');
  };

  const get = Type.getInstances;

  assert.throws(() => get.call(null), /Named/);
  assert.equal(reads, 1);
});

test('extra arguments force construction and exactly one additional registration', () => {
  let calls = 0;
  const Type = defineType('Wrap', ['value'], {
    trackInstances: true,
    validate() {
      calls++;
    }
  });
  const original = Type(1);
  const wrapped = Type(original, undefined);

  assert.equal(wrapped.value, original);
  assert.equal(calls, 2);
  assert.deepEqual(Type.getInstances(), [original, wrapped]);
});

test('prototype-only reuse does not invent a registry membership guarantee', () => {
  const Type = defineType('Open', ['value'], { trackInstances: true });
  const forged = Object.create(Type.prototype);

  Object.freeze(forged);

  assert.equal(Type(forged), forged);
  assert.deepEqual(Type.getInstances(), []);

  const explicit = new Type(forged);

  assert.equal(explicit.value, forged);
  assert.deepEqual(Type.getInstances(), [explicit]);
});

test('registry enumeration does not evaluate user-defined getters on instances', () => {
  const Type = defineType('Metadata', ['value'], { trackInstances: true });
  const item = Type(1);

  Object.defineProperty(item, 'extra', {
    enumerable: true,
    get() {
      throw new Error('must not inspect');
    }
  });

  assert.equal(Type.getInstances()[0], item);
});
