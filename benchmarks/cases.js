'use strict';

const assert = require('node:assert/strict');

function trackingOptions(Constant, factory) {
  const options = { trackInstances: true };

  try {
    Constant[factory]('TrackingProbe', [], options);

    return options;
  } catch (error) {
    // Archived comparison builds use the original option spelling.
    if (error instanceof TypeError && error.message === 'Unknown option: trackInstances') {
      return { saveInstances: true };
    }

    throw error;
  }
}

module.exports = function createCase(Constant, name, count) {
  const factory = typeof Constant.defineType === 'function' ? 'defineType' : 'newType';
  const values = Array.from({ length: 16 }, (_, i) => i + 1);
  let Type,
    run,
    consume,
    setup = () => {};

  const cases = {
    'constant-factory': () => {
      run = (i) => Constant(i, 'Item');
      consume = (a) => assert.equal(a.at(-1).value, count - 1);
    },
    'constant-new': () => {
      run = (i) => new Constant(i, 'Item');
      consume = (a) => assert.equal(a.at(-1).value, count - 1);
    },
    'constant-null-name': () => {
      run = (i) => Constant(i);
      consume = (a) => assert.equal(a.at(-1).name, null);
    },
    'constant-reuse': () => {
      const item = Constant(42);

      run = () => Constant(item);
      consume = (a) => assert.equal(a.at(-1), item);
    },
    'fields-0': () => {
      Type = Constant[factory]('Empty', []);
      run = () => Type();
      consume = (a) => assert.equal(Reflect.ownKeys(a.at(-1)).length, 0);
    },
    'fields-1': () => {
      Type = Constant[factory]('Single', ['value']);
      run = (i) => Type(i);
      consume = (a) => assert.equal(a.at(-1).value, count - 1);
    },
    'fields-2': () => {
      Type = Constant[factory]('Pair', ['left', 'right']);
      run = (i) => Type(i, i + 1);
      consume = (a) => assert.equal(a.at(-1).right, count);
    },
    'fields-2-new': () => {
      Type = Constant[factory]('Pair', ['left', 'right']);
      run = (i) => new Type(i, i + 1);
      consume = (a) => assert.equal(a.at(-1).right, count);
    },
    'fields-4': () => {
      Type = Constant[factory]('Four', ['a', 'b', 'c', 'd']);
      run = (i) => Type(i, 2, 3, 4);
      consume = (a) => assert.equal(a.at(-1).d, 4);
    },
    'fields-8': () => {
      Type = Constant[factory](
        'Eight',
        values.slice(0, 8).map((i) => 'f' + i)
      );
      run = (i) => Type(i, 2, 3, 4, 5, 6, 7, 8);
      consume = (a) => assert.equal(a.at(-1).f8, 8);
    },
    'fields-16': () => {
      Type = Constant[factory](
        'Sixteen',
        values.map((i) => 'f' + i)
      );
      run = () => Type(...values);
      consume = (a) => assert.equal(a.at(-1).f16, 16);
    },
    'validate-2': () => {
      Type = Constant[factory]('Validate', ['left', 'right'], {
        validate(left) {
          if (left < 0) throw Error('negative');
        }
      });
      run = (i) => Type(i, i + 1);
      consume = (a) => assert.equal(a.at(-1).right, count);
    },
    'normalize-2': () => {
      Type = Constant[factory]('Normalize', ['left', 'right'], {
        validate(left, right) {
          return [right, left];
        }
      });
      run = (i) => Type(i, i + 1);
      consume = (a) => assert.equal(a.at(-1).left, count);
    },
    'normalize-object-4': () => {
      Type = Constant[factory]('ObjectInput', ['a', 'b', 'c', 'd'], {
        validate(value) {
          return [value.a, value.b, value.c, value.d];
        }
      });
      const input = { a: 1, b: 2, c: 3, d: 4 };

      run = () => Type(input);
      consume = (a) => assert.equal(a.at(-1).d, 4);
    },
    'tracked-2': () => {
      const options = trackingOptions(Constant, factory);

      setup = () => {
        Type = Constant[factory]('Tracked', ['left', 'right'], options);
      };

      setup();
      run = (i) => Type(i, i + 1);
      consume = (a) => {
        assert.equal(a.at(-1).right, count);
        assert.equal(Type.getInstances().at(-1), a.at(-1));
      };
    },
    'define-type-2': () => {
      run = () => Constant[factory]('Pair', ['left', 'right']);
      consume = (a) => assert.equal(a.at(-1).name, 'Pair');
    },
    'snapshot-1000': () => {
      Type = Constant[factory]('Snapshot', ['id'], trackingOptions(Constant, factory));
      for (let i = 0; i < 1000; i++) Type(i);
      run = () => Type.getInstances();
      consume = (a) => assert.equal(a.at(-1).length, 1000);
    },
    'property-read': () => {
      const item = Constant[factory]('Pair', ['left', 'right'])(3, 5);

      run = () => item.left + item.right;
      consume = (a) => assert.equal(a.at(-1), 8);
    }
  };

  assert.ok(Object.hasOwn(cases, name), 'Unknown benchmark: ' + name);
  cases[name]();

  return { run, consume, setup };
};
