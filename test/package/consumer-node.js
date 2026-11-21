'use strict';

// Deliberately uses Node 8 syntax and built-ins: this runs in the actual consumer.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
let checks = 0;

function equal(actual, expected) {
  assert.strictEqual(actual, expected);
  checks++;
}

function rejects(fn, errorName = 'TypeError') {
  assert.throws(fn, (error) => error.name === errorName);
  checks++;
}

function contract(Constant) {
  equal(typeof Constant, 'function');
  equal(Constant.Constant, Constant);
  const Status = Constant.defineEnum({ DRAFT: 'draft', LIVE: { value: 0, label: 'Live' } }, 'Status');

  equal(Status.name, 'Status');
  equal(Constant.defineEnum({}).name, null);
  equal(Object.getOwnPropertyDescriptor(Status, 'name').enumerable, false);
  rejects(() => Constant.defineEnum({ name: 'reserved' }));
  equal(Status.fromValue(0), Status.LIVE);
  equal(Status.hasValue('0'), false);
  equal(Object.isFrozen(Status.members), true);
  const payload = { mutable: true };
  const value = Constant(payload, 42);

  equal(value.value, payload);
  equal(value.name, '42');
  equal(value.valueOf(), payload);
  equal(Constant(value), value);
  equal(Constant(value, null).value, value);
  equal(new Constant(value).value, value);
  equal(Constant().name, null);
  equal(Object.isExtensible(value), true);
  value.extra = 7;
  equal(value.extra, 7);
  equal(Object.getOwnPropertyDescriptor(value, 'value').enumerable, true);
  equal(Object.getOwnPropertyDescriptor(value, 'value').configurable, false);
  rejects(() => {
    value.value = 1;
  });
  equal('getInstances' in Constant, false);
  class Wrapped extends Constant {}
  equal(new Wrapped(3) instanceof Wrapped, true);

  const key = Symbol('rank');
  const fields = ['code', key];
  const options = {
    trackInstances: true,
    valueOf: key,
    validate(code, rank) {
      equal(Object.prototype.hasOwnProperty.call(this, 'code'), false);
      if (rank < 0) throw new TypeError('negative rank');

      return [code.trim(), rank * 2];
    }
  };
  const Item = Constant.defineType('Item', fields, options);

  fields[0] = 'changed';
  options.validate = null;
  const item = Item(' high ', 4);

  equal(item.code, 'high');
  equal(item[key], 8);
  equal(item.valueOf(), 8);
  equal(Item.name, 'Item');
  equal(Item(item), item);
  equal(Item.getInstances().length, 1);
  equal(Item.getInstances()[0], item);
  Item.getInstances().length = 0;
  equal(Item.getInstances().length, 1);
  equal('instances' in Item, false);
  equal('instances' in Constant, false);
  rejects(() => Item('bad', -1));
  equal(Item.getInstances().length, 1);
  rejects(() => {
    item[key] = 3;
  });
  equal(Object.keys(item).join(','), 'code');
  const receiver = {};

  equal(Item.call(receiver, 'low', 1) === receiver, false);
  class Child extends Item {}
  const child = new Child('child', 2);

  equal(child instanceof Child, true);
  equal(child.valueOf(), 4);
  equal(Item.getInstances().length, 3);

  rejects(() => Constant.defineType('Bad', ['a', 'a']));
  rejects(() => Constant.defineType('Bad', new Array(1)));
  rejects(() => Constant.defineType('Bad', [1]));
  rejects(() => Constant.defineType('Bad', [], { unknown: true }));
  rejects(() => Constant.defineType('Bad', [], { trackInstances: 1 }));
  rejects(() => Constant.defineType('Bad', [], { valueOf: 'missing' }));
  rejects(() => Constant.defineType('Bad', ['valueOf'], { valueOf() {} }));
  rejects(() => Constant.defineType('Bad', [], { validate: async function () {} }));
  rejects(() => Constant.defineType('Bad', [], { validate: function* () {} }));
  const Invalid = Constant.defineType('Invalid', ['x'], {
    trackInstances: true,
    validate() {
      return null;
    }
  });

  rejects(() => Invalid(1));
  equal(Invalid.getInstances().length, 0);
  const Plain = Constant.defineType(null, ['__proto__', 'constructor'], Object.create({ trackInstances: true }));
  const plain = Plain(2, 3);

  equal(plain.__proto__, 2);
  equal(plain.constructor, 3);
  equal(Plain.name, 'ConstantType');
  rejects(() => Plain.getInstances(), 'Error');
  const Method = Constant.defineType('Method', ['x'], {
    valueOf() {
      return this.x + 1;
    }
  });

  equal(Method(4).valueOf(), 5);
  const NoChange = Constant.defineType('NoChange', ['x'], { validate() {} });

  equal(NoChange(7).x, 7);
}

contract(require('go-constant'));
equal(require('go-constant').Constant, require('go-constant'));
equal(require('go-constant/Constant'), require('go-constant'));
equal(require('go-constant/defineType'), require('go-constant').defineType);
equal(require('go-constant/defineEnum'), require('go-constant').defineEnum);
equal(require('go-constant/package.json').name, 'go-constant');
equal(Object.keys(require('go-constant/package.json').dependencies || {}).length, 0);
for (const name of ['go-constant.js', 'go-constant.min.js']) {
  contract(require('go-constant/dist/' + name));
  const code = fs.readFileSync(require.resolve('go-constant/dist/' + name), 'utf8');

  for (const mode of ['global', 'amd', 'worker', 'null-module', 'commonjs']) {
    let exported;
    const sandbox = {};

    if (mode === 'null-module') sandbox.module = null;
    if (mode === 'commonjs') sandbox.module = { exports: {} };
    if (mode === 'worker') {
      sandbox.globalThis = undefined;
      sandbox.self = {};
    }

    if (mode === 'amd') {
      sandbox.define = function (deps, factory) {
        exported = factory();
      };

      sandbox.define.amd = {};
    }

    new vm.Script(code, { filename: name }).runInNewContext(sandbox);
    const browserApi = (sandbox.self || sandbox).goConstant;

    contract(exported || (mode === 'commonjs' ? sandbox.module.exports : browserApi));
  }
}

console.log('Installed CommonJS and UMD: ' + checks + ' assertions on ' + process.version);
