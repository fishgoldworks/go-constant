'use strict';

const defineType = require('./defineType');
const defineEnum = require('./defineEnum');

/**
 * Represents a constant as an object with a read-only `.value` field and an optional name.
 * A factory call with exactly one existing `Constant` reuses that object.
 * Otherwise, it creates an extensible wrapper. Stored objects retain their original mutability.
 *
 * @param {*} [value] The value to store by reference, without cloning or freezing.
 * @param {*} [name=null] The name; nullish values become `null`, others use `String(name)`.
 * @returns {Object} The sole existing instance, or a new wrapper with protected fields.
 * @throws {Error} Propagates errors from converting `name` to a string.
 * @example
 * const red = Constant("#FF0000", "Red");
 *
 * red.value;                  // => "#FF0000"
 * red.name;                   // => "Red"
 * Constant(red) === red;       // => true
 * new Constant(red) === red;   // => false
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
 * @since 1.0.0
 */
// Fixed-schema fast path: avoid the generic normaliser call and temporary tuple.
// Keep name conversion ahead of either field definition, including for subclasses.
function Constant(value) {
  if (!new.target && arguments.length === 1 && value instanceof Constant) {
    return value;
  }

  const instance = new.target ? this : Object.create(Constant.prototype);
  const inputName = arguments[1];
  const name = inputName == null ? null : String(inputName);

  Object.defineProperty(instance, 'value', {
    enumerable: true,
    configurable: false,
    writable: false,
    value
  });

  Object.defineProperty(instance, 'name', {
    enumerable: true,
    configurable: false,
    writable: false,
    value: name
  });

  return instance;
}

Object.defineProperty(Constant, 'name', { value: 'Constant', configurable: false, writable: false });

/**
 * Returns the instance's value for explicit or automatic coercion.
 * The default wrapper returns its stored `value` without cloning or conversion.
 *
 * @name Constant.prototype.valueOf
 * @function
 * @returns {*} The stored value, retaining its identity when it is an object.
 * @example
 * Constant(7).valueOf();         // => 7
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
 */
Object.defineProperty(Constant.prototype, 'valueOf', {
  // Keep the original anonymous-method name even when a minifier inlines it.
  value: Object.defineProperty(
    function () {
      return this.value;
    },
    'name',
    { value: '' }
  ),
  enumerable: false,
  configurable: true,
  writable: true
});

module.exports = Constant;
Object.defineProperty(module.exports, 'Constant', { value: Constant });
// This explicit export is also discoverable by Node's CommonJS named-export analysis.
// Older TypeScript CommonJS interop helpers copy only enumerable named exports.
Object.defineProperty(module.exports, 'defineType', { value: defineType, enumerable: true });
Object.defineProperty(module.exports, 'defineEnum', { value: defineEnum, enumerable: true });
