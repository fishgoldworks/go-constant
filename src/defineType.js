'use strict';

const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const functionSource = Function.call.bind(Function.prototype.toString);
const asyncOrGeneratorConstructor =
  /^function\s+(?:AsyncFunction|GeneratorFunction|AsyncGeneratorFunction)\s*\(\s*\)\s*\{\s*\[native code\]\s*\}$/;

function hasAsyncOrGeneratorPrototype(validate) {
  try {
    const seen = new Set();
    let prototype = Object.getPrototypeOf(validate);

    // Native kind prototypes also identify bound callbacks and callbacks from another realm.
    while (prototype !== null && prototype !== Function.prototype && !seen.has(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
      const constructor = descriptor && descriptor.value;

      if (
        typeof constructor === 'function' &&
        asyncOrGeneratorConstructor.test(functionSource(constructor)) &&
        constructor.prototype === prototype
      ) {
        return true;
      }

      seen.add(prototype);
      prototype = Object.getPrototypeOf(prototype);
    }
  } catch (error) {
    // A callable proxy may hide its prototype. Check its result during construction.
    return false;
  }

  return false;
}

/** Read only an explicit option, not an inherited Object.prototype method. */
function readOption(options, key) {
  return options != null && hasOwn(options, key) ? options[key] : undefined;
}

/**
 * Creates a reusable constructor for records with read-only declared fields.
 * Call the returned constructor with or without `new` to create records.
 * The schema and own options are captured once. New records are extensible,
 * and referenced values retain their original mutability. Tracking retains strong references.
 *
 * @param {*} [name="ConstantType"] The display name; nullish uses the default, otherwise string-converted.
 * @param {Array<string|symbol>|null} [propNames] Dense, unique field names in construction order; nullish means no fields.
 * @param {Object|null} [options] Own `validate`, `valueOf` and `trackInstances` options; inherited keys are ignored.
 * @param {Function|null} [options.validate] Synchronous hook called with a fresh instance as `this` before field creation.
 * Return an array to normalise arguments or `undefined` to retain them; throw to reject construction.
 * @param {string|symbol|Function|null} [options.valueOf] Declared field selector or method called with the instance as `this`.
 * @param {boolean} [options.trackInstances=false] Whether to retain successful constructions for snapshots.
 * @returns {Function} A callable and newable record constructor with protected `name` and `getInstances` members.
 * @throws {TypeError} If the schema or own options are invalid, including async or generator validators.
 * @throws {Error} Propagates errors from reading configuration or converting the type name.
 * @example
 * const Priority = Constant.defineType(
 *   "Priority", ["code", "rank"]
 * );
 *
 * const normal = Priority("normal", 20);
 * const high = Priority("high", 30);
 *
 * normal.code;   // => "normal"
 * normal.rank;   // => 20
 * high.code;     // => "high"
 * high.rank;     // => 30
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
 * @since 2.0.0
 */
function defineType(name, propNames, options) {
  if (propNames != null && !Array.isArray(propNames)) {
    throw new TypeError('fields must be an array of unique strings or symbols.');
  }

  if (options != null && (typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('options must be an object, null, or undefined.');
  }

  // Validate keys before evaluating any option accessor. Inherited options
  // remain ignored; hidden and symbol keys must not conceal misspellings.
  if (options != null) {
    for (const key of Reflect.ownKeys(options)) {
      if (key !== 'validate' && key !== 'valueOf' && key !== 'trackInstances') {
        if (key === 'saveInstances') {
          throw new TypeError('Use trackInstances instead of saveInstances.');
        }

        throw new TypeError('Unknown option: ' + String(key));
      }
    }
  }

  // Copy explicitly rather than retaining caller-owned arrays or their species.
  const fields = [];
  const seen = new Set();

  if (propNames != null) {
    const length = propNames.length;

    for (let i = 0; i < length; i++) {
      if (!hasOwn(propNames, i)) {
        throw new TypeError('fields must be dense; sparse array holes are not allowed.');
      }

      const field = propNames[i];

      if (typeof field !== 'string' && typeof field !== 'symbol') {
        throw new TypeError('Each field must be a string or symbol.');
      }

      if (seen.has(field)) {
        throw new TypeError('Duplicate field: ' + String(field));
      }

      seen.add(field);
      fields.push(field);
    }
  }

  const validate = readOption(options, 'validate');
  const valueOf = readOption(options, 'valueOf');
  const trackInstances = readOption(options, 'trackInstances');
  const typeName = name == null ? 'ConstantType' : String(name);

  if (validate != null) {
    if (typeof validate !== 'function') {
      throw new TypeError('validate must be a synchronous function, null, or undefined.');
    }

    if (hasAsyncOrGeneratorPrototype(validate)) {
      throw new TypeError('validate must be synchronous; async and generator functions are not supported.');
    }
  }

  if (trackInstances !== undefined && typeof trackInstances !== 'boolean') {
    throw new TypeError('trackInstances must be a boolean when provided.');
  }

  if (valueOf != null) {
    if (typeof valueOf !== 'function' && typeof valueOf !== 'string' && typeof valueOf !== 'symbol') {
      throw new TypeError('valueOf must be a declared field key, a function, null, or undefined.');
    }

    if (typeof valueOf !== 'function' && !seen.has(valueOf)) {
      throw new TypeError('valueOf must select a declared field: ' + String(valueOf));
    }

    if (seen.has('valueOf')) {
      throw new TypeError('A valueOf field cannot be combined with the valueOf option.');
    }
  }

  const instances = trackInstances === true ? [] : null;
  const fieldCount = fields.length;

  function initialize(instance, originalArgs) {
    const normalized = validate == null ? undefined : Reflect.apply(validate, instance, originalArgs);

    if (normalized !== undefined && !Array.isArray(normalized)) {
      throw new TypeError('validate must return undefined or an array of normalized arguments.');
    }

    const args = normalized === undefined ? originalArgs : normalized;

    for (let i = 0; i < fieldCount; i++) {
      Object.defineProperty(instance, fields[i], {
        enumerable: true,
        configurable: false,
        writable: false,
        value: args[i]
      });
    }

    // Do not register rejected or partially initialised instances.
    if (instances !== null) {
      instances.push(instance);
    }

    return instance;
  }

  /**
   * Creates a record with read-only fields in schema order.
   * A factory call with exactly one instance of this type reuses it without
   * validation or registration. `new` always initialises a fresh record.
   * The validator runs before field creation; tracking retains successful constructions.
   *
   * @param {...*} args Positional values, optionally normalised by the validator; missing fields receive `undefined`.
   * @returns {Object} The sole existing instance, or a new record with protected declared fields.
   * @throws {TypeError} If the validator returns neither an array nor `undefined`.
   * @throws {Error} Propagates validator and field-definition errors.
   * @example
   * const Item = Constant.defineType("Item", ["code"]);
   * const item = Item("A");
   * item.code;                     // => "A"
   * Item(item) === item;           // => true
   * new Item(item) === item;       // => false
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypeargs
   */
  function ConstantType(arg) {
    if (new.target) {
      return initialize(this, arguments);
    }

    if (arguments.length === 1 && arg instanceof ConstantType) {
      return arg;
    }

    // A factory call never reinitialises its call/apply receiver. Avoid an
    // additional constructor invocation and spreading an unbounded argument list.
    return initialize(Object.create(ConstantType.prototype), arguments);
  }

  /**
   * Returns a fresh snapshot of the tracked instances.
   * The mutable array contains the original objects in construction order.
   * Editing it does not change the registry, and later constructions do not update it.
   *
   * @returns {Array<Object>} A fresh shallow array of registered instances; reused instances are not added again.
   * @throws {Error} If `trackInstances` was not `true` when the type was defined.
   * @example
   * const Item = Constant.defineType("Item", ["code"], { trackInstances: true });
   * Item("A");
   * const snapshot = Item.getInstances();
   * snapshot.length = 0;
   * Item.getInstances().length;    // => 1
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
   * @since 2.0.0
   */
  function getInstances() {
    if (instances === null) {
      throw new Error(
        'Cannot get instances of "' +
          typeName +
          '": instance tracking was not enabled.\n' +
          'Define the type with { trackInstances: true } to collect instances.'
      );
    }

    return instances.slice();
  }

  // These two known descriptors need no intermediate descriptor-map enumeration.
  Object.defineProperty(ConstantType, 'name', { value: typeName, configurable: false, writable: false });
  Object.defineProperty(ConstantType, 'getInstances', { value: getInstances, configurable: false, writable: false });

  /**
   * Returns the instance's value for explicit or automatic coercion.
   * The configured method returns the selected field or calls `options.valueOf`
   * with the instance as `this`. Without this option, ordinary object behaviour applies.
   *
   * @name Type.prototype.valueOf
   * @function
   * @returns {*} The selected field or callback result; it need not be a primitive.
   * @throws {Error} Propagates errors from the configured callback.
   * @example
   * const Level = Constant.defineType("Level", ["rank"], { valueOf: "rank" });
   * Level(30).valueOf();           // => 30
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
   */
  if (valueOf != null) {
    Object.defineProperty(ConstantType.prototype, 'valueOf', {
      value:
        typeof valueOf === 'function'
          ? valueOf
          : function () {
              return this[valueOf];
            },
      enumerable: false,
      configurable: true,
      writable: true
    });
  }

  return ConstantType;
}

module.exports = defineType;
