"use strict";

const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const functionTag = Function.call.bind(Object.prototype.toString);

/** Read only an explicit option, not an inherited Object.prototype method. */
function readOption(options, key) {
    return options != null && hasOwn(options, key) ? options[key] : undefined;
}

/**
 * Create a constructor for records with read-only declared properties.
 *
 * The schema and explicit options are captured once. Values are not cloned or
 * frozen, and instances remain extensible. This is not a closed enum or a
 * security boundary.
 *
 * @param {*} [name] Display name, converted to a string; nullish means ConstantType.
 * @param {Array<string|symbol>|null} [propNames] Dense, unique property keys.
 * @param {Object|null} [options] Own construction options.
 * @param {Function|null} [options.validate] Synchronous hook called on a fresh
 * instance before its fields are defined. Throw to reject; return undefined to
 * keep the arguments, or an array to normalize them.
 * @param {string|symbol|Function|null} [options.valueOf] Declared field selector
 * or a method invoked with the instance as this.
 * @param {boolean} [options.saveInstances=false] Record successful constructions.
 * @returns {Function} Callable/newable constructor with getInstances().
 * @since 1.1.0
 */
function newType(name, propNames, options) {
    if (propNames != null && !Array.isArray(propNames)) {
        throw new TypeError("fields must be an array of unique strings or symbols.");
    }
    if (options != null && (typeof options !== "object" || Array.isArray(options))) {
        throw new TypeError("options must be an object, null, or undefined.");
    }

    // Validate keys before evaluating any option accessor. Inherited options
    // remain ignored; hidden and symbol keys must not conceal misspellings.
    if (options != null) {
        for (const key of Reflect.ownKeys(options)) {
            if (key !== "validate" && key !== "valueOf" && key !== "saveInstances") {
                throw new TypeError("Unknown option: " + String(key));
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
                throw new TypeError("fields must be dense; sparse array holes are not allowed.");
            }
            const field = propNames[i];
            if (typeof field !== "string" && typeof field !== "symbol") {
                throw new TypeError("Each field must be a string or symbol.");
            }
            if (seen.has(field)) {
                throw new TypeError("Duplicate field: " + String(field));
            }
            seen.add(field);
            fields.push(field);
        }
    }

    const validate = readOption(options, "validate");
    const valueOf = readOption(options, "valueOf");
    const saveInstances = readOption(options, "saveInstances");
    const typeName = name == null ? "ConstantType" : String(name);

    if (validate != null) {
        if (typeof validate !== "function") {
            throw new TypeError("validate must be a synchronous function, null, or undefined.");
        }
        // Reject ordinary async/generator declarations without invoking them.
        // Returned values are also checked for ordinary functions and proxies.
        const tag = functionTag(validate);
        if (tag === "[object AsyncFunction]" || tag === "[object GeneratorFunction]" ||
                tag === "[object AsyncGeneratorFunction]") {
            throw new TypeError("validate must be synchronous; async and generator functions are not supported.");
        }
    }
    if (saveInstances !== undefined && typeof saveInstances !== "boolean") {
        throw new TypeError("saveInstances must be a boolean when provided.");
    }
    if (valueOf != null) {
        if (typeof valueOf !== "function" && typeof valueOf !== "string" && typeof valueOf !== "symbol") {
            throw new TypeError("valueOf must be a declared field key, a function, null, or undefined.");
        }
        if (typeof valueOf !== "function" && !seen.has(valueOf)) {
            throw new TypeError("valueOf must select a declared field: " + String(valueOf));
        }
        if (seen.has("valueOf")) {
            throw new TypeError("A valueOf field cannot be combined with the valueOf option.");
        }
    }

    const instances = saveInstances === true ? [] : null;
    const fieldCount = fields.length;

    function initialize(instance, originalArgs) {
        const normalized = validate == null ? undefined : Reflect.apply(validate, instance, originalArgs);
        if (normalized !== undefined && !Array.isArray(normalized)) {
            throw new TypeError("validate must return undefined or an array of normalized arguments.");
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
        // Do not register rejected or partially initialized instances.
        if (instances !== null) instances.push(instance);
        return instance;
    }

    function ConstantType(arg) {
        if (new.target) return initialize(this, arguments);
        if (arguments.length === 1 && arg instanceof ConstantType) return arg;
        // A factory call never reinitializes its call/apply receiver. Avoid an
        // additional constructor invocation and spreading an unbounded argument list.
        return initialize(Object.create(ConstantType.prototype), arguments);
    }

    /** Return a fresh, mutable shallow snapshot in construction order. @since 2.0.0 */
    function getInstances() {
        if (instances === null) {
            throw new TypeError("Instance tracking is not enabled for " + typeName + ".");
        }
        return instances.slice();
    }

    Object.defineProperties(ConstantType, {
        name: { value: typeName, configurable: false, writable: false },
        getInstances: { value: getInstances, configurable: false, writable: false }
    });
    if (instances !== null) {
        // Compatibility getter: never expose the private backing array.
        Object.defineProperty(ConstantType, "instances", {
            enumerable: true,
            configurable: false,
            get: getInstances
        });
    }
    if (valueOf != null) {
        Object.defineProperty(ConstantType.prototype, "valueOf", {
            value: typeof valueOf === "function" ? valueOf : function () { return this[valueOf]; },
            enumerable: false,
            configurable: true,
            writable: true
        });
    }
    return ConstantType;
}

module.exports = newType;
