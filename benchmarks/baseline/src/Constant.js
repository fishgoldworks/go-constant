"use strict";

const newType = require("./newType");

/**
 * Wrap a value in a record with read-only, enumerable value and name fields.
 * The value retains its identity. Nullish names become null; other names are
 * stringified. A single existing Constant argument is reused by factory calls;
 * explicit new construction, or additional arguments, create a fresh wrapper.
 *
 * @param {*} [value] The value to retain, without cloning or freezing.
 * @param {*} [name] Optional name, normalized to string or null.
 * @returns {Object} An extensible Constant instance.
 * @example
 * const RED = Constant("#FF0000", "Red");
 * RED.value;   // "#FF0000"
 * RED.name;    // "Red"
 * @since 1.0.0
 */
const Constant = newType("Constant", ["value", "name"], {
    validate(value, name) {
        return [value, name == null ? null : String(name)];
    },
    valueOf: "value"
});

module.exports = Constant;
// This explicit export is also discoverable by Node's CommonJS named-export analysis.
Object.defineProperty(module.exports, "newType", { value: newType });
