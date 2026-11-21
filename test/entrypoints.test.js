'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Constant = require('../index.js');

test('defineType is the record constructor factory on the CommonJS and ES module roots', async () => {
  const esm = await import('../index.mjs');

  assert.equal(typeof Constant.defineType, 'function');
  assert.equal(esm.defineType, Constant.defineType);
  assert.equal('newType' in Constant, false);
  assert.equal('newType' in esm, false);
});

test('CommonJS root exports the original constructor and defineType', () => {
  assert.equal(Constant, require('../src/Constant'));
  assert.equal(Constant.defineType, require('../src/defineType'));
  assert.throws(() => {
    Constant.defineType = () => {};
  }, TypeError);
});

test('ESM default and named exports share CommonJS identity', async () => {
  const esm = await import('../index.mjs');

  assert.equal(esm.default, Constant);
  assert.equal(esm.Constant, Constant);
  assert.equal(Constant.Constant, Constant);
  assert.equal(esm.defineType, Constant.defineType);

  const existing = Constant(1);

  assert.equal(esm.default(existing), existing);

  const Type = esm.defineType('Tracked', ['code'], { trackInstances: true });
  const item = Type(1);

  assert.deepEqual(Type.getInstances(), [item]);
});

test('native ESM can discover the defineType named export through the CJS root', async () => {
  const esm = await import('../index.js');

  assert.equal(esm.defineType, Constant.defineType);
});

test('root ESM and CommonJS exports share the enum factory', async () => {
  const esm = await import('../index.mjs');
  const cjs = await import('../index.js');

  assert.equal(typeof Constant.defineEnum, 'function');
  assert.equal(esm.defineEnum, Constant.defineEnum);
  assert.equal(cjs.defineEnum, Constant.defineEnum);
});
