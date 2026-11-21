# Migrating from go-constant 1.x to 2.0

This guide covers upgrading from the published 1.1.0 package, including applications still using 1.0.0. [`Constant()`](API.md#constantvalue-name) still represents a constant as an extensible object with a read-only [`.value`](API.md#instancevalue) field and an optional display name. Stored objects retain their original mutability. See [Runtime support](../README.md#runtime-support) for the current environment requirements.

## Changes to review

- The record type factory was renamed from [`newType()`](#rename-the-record-type-factory) to [`defineType()`](API.md#definetypename-fields-options). Update calls and imports.
- The tracking option was renamed from [`saveInstances`](#replace-mutable-registry-access-with-snapshots) to [`trackInstances`](API.md#definetypename-fields-options).
- The live [`.instances`](#replace-mutable-registry-access-with-snapshots) array was removed. Use [`getInstances()`](API.md#mytypegetinstances) for fresh snapshots; see the [registry migration steps](#replace-mutable-registry-access-with-snapshots).
- Factory reuse and explicit receivers have [changed construction rules](#review-instance-reuse-and-explicit-receivers).
- Type configuration is now [validated and captured at definition time](#capture-valid-configuration-when-defining-a-type).
- Validators must [throw on rejection and return an array or `undefined`](#return-an-array-or-undefined-from-validators).
- Configured [`valueOf()`](API.md#instancevalueof) methods are now non-enumerable.
- [`Constant.defineType`](API.md#constantdefinetype) is now protected. Review [enumeration and attached members](#check-enumeration-and-attached-members).
- Supported public entry points replace internal deep imports. See the [import migration steps](#use-public-imports-and-included-declarations).
- Included declarations require TypeScript 5.4 or newer and can expose previously unchecked code. Review the [TypeScript upgrade guidance](#use-public-imports-and-included-declarations).
- The browser and worker global was renamed from [`Constant`](API.md#constantvalue-name) to [`goConstant`](API.md#constantvalue-name). See the [global migration steps](#rename-the-browser-and-worker-global).
- Version 2.0 uses the [MIT licence](../LICENSE.md); published 1.x packages retain their original licence.

## Rename the record type factory

Update calls and imports to use [`defineType`](API.md#definetypename-fields-options).

<!-- prettier-ignore -->
| Usage | In 1.1.0 | In 2.0.0 |
| --- | --- | --- |
| CommonJS method | `Constant.newType(...)` | `Constant.defineType(...)` |
| CommonJS destructuring | `const { newType } = require('go-constant')` | `const { defineType } = require('go-constant')` |
| CommonJS deep import | `require('go-constant/src/newType')` | `require('go-constant/defineType')` |
| Browser or worker global | `Constant.newType(...)` | `goConstant.defineType(...)` |

In ES modules, use `import { defineType } from "go-constant"`. If you enabled instance tracking, also [update the option and snapshot access](#replace-mutable-registry-access-with-snapshots).

## Replace mutable registry access with snapshots

In 1.1.0, `saveInstances: true` enabled tracking and `.instances` exposed the live array.

```javascript
const { newType } = require('go-constant');

const Priority = newType('Priority', ['rank'], { saveInstances: true });
Priority(20);
Priority(10);
const instances = Priority.instances;
```

In 2.0.0, set `trackInstances: true` when you call [`defineType()`](API.md#definetypename-fields-options) and call [`getInstances()`](API.md#mytypegetinstances) to read the tracked records.

<!-- prettier-ignore -->
```javascript
const { defineType } = require('go-constant');

const Priority = defineType('Priority', ['rank'], { trackInstances: true });
Priority(20);
Priority(10);

const snapshot = Priority.getInstances();
snapshot.sort((a, b) => a.rank - b.rank);
Priority.getInstances().map((item) => item.rank);  // => [20, 10]
```

Replace [`saveInstances`](#replace-mutable-registry-access-with-snapshots) wherever you pass it to [`defineType()`](API.md#definetypename-fields-options). An own [`saveInstances`](#replace-mutable-registry-access-with-snapshots) key throws `TypeError` even when its value is `false` or `undefined`. For types that should leave tracking disabled, omit the option or set `trackInstances: false`.

Each call to [`getInstances()`](API.md#mytypegetinstances) returns a fresh shallow array of the original records in registration order. Call it again to include later records. Editing or sorting the array leaves the registry intact. Use an application-owned collection if you need to insert, remove, reorder or clear entries in the underlying list.

If your code checked `.instances` to detect whether tracking was enabled, keep the flag you passed as [`trackInstances`](API.md#definetypename-fields-options). Call [`getInstances()`](API.md#mytypegetinstances) only when that flag was `true`. With tracking disabled, the method throws a plain `Error` with guidance to enable tracking when defining the type. An enabled registry with no records returns an empty array.

## Review instance reuse and explicit receivers

With exactly one argument, [`Constant()`](API.md#constantvalue-name) and [generated constructors](API.md#mytypeargs) still reuse an instance of the same constructor without validation or registration. For example, `Constant(existing)` reuses a constant instance, while `Constant(existing, "Wrapper")` creates a wrapper whose value is `existing`. In 1.x, the factory discarded the additional name and reused the existing wrapper.

Explicit `new` continues to create a fresh instance. Factory calls made through `.call()` or `.apply()` now ignore the supplied receiver. Replace code that initialises a pre-existing receiver with a normal factory call or construction with `new`.

## Capture valid configuration when defining a type

The field array and own option values are copied when [`defineType()`](API.md#definetypename-fields-options) runs. Changing the original schema, validator, coercion selector or tracking flag no longer reconfigures that type. Define another type when different configuration is needed; callback closure state remains mutable.

Only own [`validate`](API.md#validation-and-normalisation), [`valueOf`](API.md#definetypename-fields-options) and [`trackInstances`](API.md#definetypename-fields-options) options are accepted. Unknown own keys, including non-enumerable and symbol keys, throw `TypeError`. Inherited options are ignored. Use a plain object containing the intended options, and remove unrelated metadata or misspelled keys.

Invalid definitions now fail before construction:

- Fields must be a dense array of unique strings or symbols, or `null`/`undefined` for no fields. Replace numeric keys with strings, and remove duplicate keys and holes. A string is no longer accepted as a character list.
- Options must be a non-array object, `null` or `undefined`. [`trackInstances`](API.md#definetypename-fields-options) accepts a boolean or `undefined`. Only `true` enables tracking.
- [`valueOf`](API.md#definetypename-fields-options) must be a declared field selector, a function, `null` or `undefined`. Correct missing selectors. For a data field named [`valueOf`](API.md#a-data-field-named-valueof), omit the coercion option or pass `null`/`undefined`.

Constructor names are now consistently converted to strings; omitted/nullish names become `"ConstantType"`. Conversion and option-accessor errors still propagate. Symbol and `"__proto__"` field names remain supported. Missing constructor arguments remain `undefined` unless a validator supplies defaults or rejects them.

## Return an array or undefined from validators

Validators run synchronously before field creation. Throw to reject input, return `undefined` to retain the original arguments, or return an array of normalised values. Other returns—including booleans, `null`, strings, promises and array-like objects—throw `TypeError`. Native async/generator validators are rejected when defining the type.

Replace a returned `arguments` object with `Array.from(arguments)`. Adapt predicates to throw on rejection rather than returning `true` or `false`:

```javascript
const { defineType } = require('go-constant');

const Positive = defineType('Positive', ['value'], {
  validate(value) {
    if (!(value > 0)) throw new RangeError('value must be positive');
  }
});
```

## Check enumeration and attached members

Configured prototype [`valueOf`](API.md#instancevalueof) methods are now non-enumerable, so `for...in` no longer lists them. They remain writable and configurable. [`Constant.defineType`](API.md#constantdefinetype) is enumerable, non-writable and non-configurable. Remove assignments to this factory and attempts to delete it.

[`getInstances`](API.md#mytypegetinstances) is a protected static name on constructors created by [`defineType()`](API.md#definetypename-fields-options). Avoid collisions with it and built-in names such as `name` and `prototype`. For reusable records, store named instances in a [separate table](API.md#enum-like-definitions).

## Use public imports and included declarations

Continue using the CommonJS root:

```javascript
const Constant = require('go-constant');
const { defineType } = Constant;
```

ES modules support `import { Constant, defineType } from "go-constant"` and the default [`Constant`](API.md#constantvalue-name) import, sharing identity with CommonJS. Replace internal `go-constant/src/*` imports with the root or the corresponding focused entry, such as `go-constant/defineType`. Modern Node.js rejects internal paths through the export map, while Node.js 8 resolves physical files. The two browser bundles and their maps remain available under `go-constant/dist/`, and `go-constant/package.json` is exported for tooling.

Use [`defineEnum()`](API.md#defineenumdefinitions-name) for a fixed set of named constants with optional metadata, exact value lookup and membership checks. Use [`defineType()`](API.md#definetypename-fields-options) when callers need to create additional records over time. See [record identity and freezing](API.md#enum-records-identity-and-freezing) for how to copy fields into an enum member or preserve the record in metadata.

The package now includes declarations requiring TypeScript 5.4 or newer; 1.x did not ship declarations. Previously untyped consumers may see type errors. Field names alone produce `unknown` values: annotate validator inputs and return a typed tuple, or supply explicit key/value tuples. A validation-only callback should return `undefined` explicitly in its type for precise inference; an erased `void` return receives conservative fields.

Generated record types describe constructor inputs and cannot establish which constructor created a structural object. Retain an existing record directly when its shape is not a valid typed constructor input. Optional configuration and dynamic schema keys also receive conservative types. See the [TypeScript reference](API.md#typescript) for examples and limitations.

## Rename the browser and worker global

In browsers and workers, the bundles now expose [`goConstant`](API.md#constantvalue-name). Replace `Constant(25)` with `goConstant(25)` or `goConstant.Constant(25)`. See [the factory rename](#rename-the-record-type-factory) for browser and worker calls that create a record type.

## Licence

Version 2.0 uses the [MIT licence](../LICENSE.md). Published 1.x packages carried their original licence.
