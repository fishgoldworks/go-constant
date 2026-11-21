# Changelog

## 2.0.0

See the [1.x migration guide](docs/migration.md) before upgrading.

### Breaking changes

- Renamed [`newType()`](docs/migration.md#rename-the-record-type-factory) to [`defineType()`](docs/API.md#definetypename-fields-options). See [how to update calls and imports](docs/migration.md#rename-the-record-type-factory).
- Renamed the [`saveInstances`](docs/migration.md#replace-mutable-registry-access-with-snapshots) option to [`trackInstances`](docs/API.md#definetypename-fields-options). Update the key in [`defineType()`](docs/API.md#definetypename-fields-options) options before upgrading.
- Removed [`MyType.instances`](docs/migration.md#replace-mutable-registry-access-with-snapshots). Use the new [`MyType.getInstances()`](docs/API.md#mytypegetinstances) method to read a fresh shallow snapshot of tracked instances. It throws `Error` if tracking was not enabled when the type was defined.
- Limited factory identity reuse to exactly one existing-instance argument. Calls with additional arguments now construct a new record, and `.call()`/`.apply()` no longer initialise a supplied receiver.
- Captured schemas and own options when defining a type. Invalid schemas, unknown options, invalid coercion selectors and unsupported validator returns now throw `TypeError`; validators must return an array or `undefined`.
- Made configured [`valueOf`](docs/API.md#instancevalueof) methods non-enumerable and [`Constant.defineType`](docs/API.md#constantdefinetype) non-writable and non-configurable. Converted generated constructor names to strings.
- Defined supported package entry points, replacing internal deep imports on runtimes that enforce export maps. CommonJS requires Node.js 8.0.0 or later; native ES modules require Node.js 12.17.0+ within 12.x or Node.js 14.0.0 and later.
- Renamed the browser and worker global from [`Constant`](docs/API.md#constantvalue-name) to [`goConstant`](docs/API.md#constantvalue-name). Both [`goConstant()`](docs/API.md#constantvalue-name) and [`goConstant.Constant()`](docs/API.md#constantvalue-name) call the same function.

### Added

- Added [`defineEnum(definitions, name?)`](docs/API.md#defineenumdefinitions-name) for a fixed set of named constants with optional member metadata and an optional enum name, shallow freezing, exact value lookup and membership checks. Expanded members take [plain data objects](docs/API.md#enum-records-identity-and-freezing). In TypeScript, a literal [`fromValue()`](docs/API.md#myenumfromvalueinput) input narrows the possible member types.
- Added a native ES module root with default [`Constant`](docs/API.md#constantvalue-name) and named [`Constant`](docs/API.md#constantvalue-name), [`defineType`](docs/API.md#definetypename-fields-options) and [`defineEnum`](docs/API.md#defineenumdefinitions-name) exports sharing CommonJS identity.
- Added the named [`Constant`](docs/API.md#constantvalue-name) property to the CommonJS root and focused [`Constant`](docs/API.md#constantvalue-name), [`defineType`](docs/API.md#definetypename-fields-options) and [`defineEnum`](docs/API.md#defineenumdefinitions-name) entries for CommonJS and ES modules.
- Added TypeScript 5.4+ declarations for CommonJS, ES modules and browser globals, with inferred validator inputs and normalised record fields.

### Changed

- Adopted the MIT licence while preserving the existing copyright attribution.
- Retained self-contained readable and minified browser bundles with source maps, licence notices and CommonJS/AMD loaders.

### Performance

- Reduced built-in wrapper construction and type-definition overhead while preserving protected fields, validation order and snapshot isolation. See the [historical measurements](https://github.com/fishgoldworks/go-constant/blob/master/docs/performance.md).

## 1.1.0 — 2023-01-23

- Added the [`newType`](docs/migration.md#rename-the-record-type-factory) function to allow creating new constant types.

## 1.0.0 — 2022-12-06

- Initial release
