'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const runCleanups = require('../../scripts/cleanup');

test('cleanup preserves a single primary failure including falsy thrown values', () => {
  for (const primary of [new Error('primary'), null, undefined, false, 0, '']) {
    let caught = false;

    try {
      runCleanups([() => {}], [primary]);
    } catch (error) {
      caught = true;
      assert.equal(error, primary);
    }

    assert.equal(caught, true);
  }
});

test('all cleanup operations run and combined errors preserve their identities and order', () => {
  const primary = new Error('primary');
  const first = new Error('first cleanup');
  const second = new Error('second cleanup');
  const completed = [];

  assert.throws(
    () =>
      runCleanups(
        [
          () => {
            completed.push('first');
            throw first;
          },
          () => {
            completed.push('second');
            throw second;
          },
          () => {
            completed.push('last');
          }
        ],
        [primary]
      ),
    (error) => {
      assert.deepEqual(error.errors, [primary, first, second]);

      return true;
    }
  );
  assert.deepEqual(completed, ['first', 'second', 'last']);
});

test('a cleanup-only failure keeps its identity and successful cleanup returns normally', () => {
  const failure = new Error('cleanup');

  assert.throws(
    () =>
      runCleanups([
        () => {
          throw failure;
        }
      ]),
    (error) => error === failure
  );
  assert.equal(runCleanups([() => {}]), undefined);
});
