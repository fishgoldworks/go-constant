'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Constant = require('./helpers/library.js');

for (const selected of ['left', 'right']) {
  test(`a selected dynamic field defines only ${selected}, including in snapshots`, () => {
    const Type = Constant.defineType('Selected', [selected], {
      validate(value) {
        return [value];
      },
      trackInstances: true
    });
    const item = Type(42);
    const missing = selected === 'left' ? 'right' : 'left';

    assert.deepEqual(Object.keys(item), [selected]);
    assert.equal(item[selected], 42);
    assert.equal(item[missing], undefined);
    assert.equal(Object.hasOwn(item, missing), false);
    assert.equal(Type.getInstances()[0], item);
    assert.equal(Type.getInstances()[0][missing], undefined);
  });
}

for (const selected of ['left', 'field_left', 'toString']) {
  test(`dynamic and fixed fields retain different values: ${selected}`, () => {
    const Type = Constant.defineType('Mixed', [selected, 'fixed'], {
      validate(value, fixed) {
        return [value, fixed];
      }
    });
    const item = Type(42, true);

    assert.equal(item[selected], 42);
    assert.equal(item.fixed, true);
    assert.equal(item.field_absent, undefined);

    for (const key of [selected, 'fixed']) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);

      assert.equal(descriptor.writable, false);
      assert.equal(descriptor.configurable, false);
    }
  });
}

test('a dynamic symbol selection does not create alternative symbols', () => {
  const selected = Symbol('field');
  const other = Symbol('field');
  const Type = Constant.defineType('Symbols', [selected, 'label']);
  const item = Type(7, 'selected');

  assert.equal(item[selected], 7);
  assert.equal(item[other], undefined);
  assert.equal(item.label, 'selected');
  assert.deepEqual(Object.getOwnPropertySymbols(item), [selected]);
});

test('uncertain schema positions that collide still fail at definition', () => {
  assert.throws(() => Constant.defineType('Duplicate', ['fixed', 'fixed']), /Duplicate field/);
});
