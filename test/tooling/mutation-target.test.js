'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const replace = require('../../scripts/mutation-target.js');

test('mutation targets survive whitespace, comments and quote formatting', () => {
  assert.equal(replace("const value = 'x';\n", 'value="x"', 'value = 2', 'value'), 'const value = 2;\n');
  assert.equal(replace('a /* explanation */ + b', 'a+b', 'a - b', 'sum'), 'a - b');
});

test('missing and ambiguous mutation targets fail instead of silently weakening controls', () => {
  assert.throws(() => replace('a + b', 'a-b', '0', 'missing'), /one exact/);
  assert.throws(() => replace('a + b; a + b', 'a+b', '0', 'duplicate'), /one exact/);
});

test('interpolated templates do not hide targets later in the source', () => {
  assert.equal(
    replace('const text = `value:${value}`; a + b', 'a+b', 'a-b', 'after template'),
    'const text = `value:${value}`; a-b'
  );
});

test('explicit all mode retains controls that deliberately change every matching expression', () => {
  assert.equal(replace('a + b; a + b', 'a+b', 'a-b', 'all sums', 'all'), 'a-b; a-b');
});
