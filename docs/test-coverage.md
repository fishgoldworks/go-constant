# Test coverage

The shared runtime discovery rule runs the same core behaviour tests against source,
both browser bundles and the installed tarball. Import identity and executable
documentation checks also run in the ordinary suite. Repetitions across artefacts
are not additional unique cases.

The option/construction matrix and seeded model tests cover protected descriptors,
mutable references, schema capture, unknown/inherited options, normalisation errors,
factory reuse, recursive registration, subclasses, symbols, proxies and snapshot
isolation. Seeds and scenario counts are owned by their executable fixtures.

Enum tests cover exact lookup and membership checks, duplicate values, the
read-only and non-enumerable name, reserved top-level keys, and shallow freezing
while enum creation leaves caller-owned definitions unchanged.

Strict declaration fixtures cover Node/CommonJS, native ESM, bundler resolution and
browser globals. Optional configuration, dynamic keys, spread copies, coercion,
read-only properties and validator input/output boundaries have focused regressions.
The emitted runtime fixture checks that accepted TypeScript behaves as declared.
Installed consumers repeat boundary checks with both optional-property modes.

Build tests exercise broken functional output, stale/missing/unexpected artefacts,
staging failures, failed backup moves, installation failures, successful/failed
rollback, and cleanup diagnostics. Loader tests include CommonJS/AMD precedence,
global/worker fallbacks, null module sentinels and separate realms without dynamic
code generation. Artefact checks require current bytes, real compression, notices
and composed readable/minified maps matching the bundled source after normalising
line endings. Regressions reject corrupt embedded content and an uncomposed map;
build tests decode representative mappings back to constructor and enum source lines.

Package tests inspect an exact allowlist, install offline into a temporary consumer,
check local documentation links and exercise public imports, runtime and declarations.
The JavaScript and TypeScript example runners read the installed README and API reference when
`GO_CONSTANT_PACKAGE_ROOT` points to the installed package directory. Runtime
imports, browser bundles and declaration resolution use that same package; the
compiler remains a development tool. Regression fixtures change the isolated
documentation results to verify that the runners use the installed examples.
Candidate creation builds and packs once with lifecycle hooks disabled to avoid
recursion. Verification reuses that archive on modern Node and the exact Node.js
8.0.0 floor; the floor uses a compatible consumer harness. Missing supplied
archives fail instead of triggering an implicit rebuild. `test:package` always
runs the modern suite; an optional `--node` adds compatible regressions on the
selected runtime and native ES module checks on the supported Node.js 12.17+ release line or Node.js 14+.

`test:tooling` checks coverage inventory, benchmark commands and ESLint's
conditional-return restriction across maintained JavaScript and TypeScript scopes.
It pairs rejected unbraced returns with accepted braced returns. `test:release`
rejects missing archives before invoking npm and rejects a changed archive when
its recorded SHA-256 no longer matches. Benchmark tests cover explicit files,
declared directory entry points, index fallbacks, filename collisions and loaded
source attribution. Unexpected worker failures fail the command; bounded timeouts
are explicitly reported without invented timing results.

The source-line badge is measured by `npm run coverage`, which enforces 100% lines,
branches and functions and requires a measured entry for each maintained JavaScript
module under `src/`. The documentation badge
counts public API members and call/construct forms with checked reference sections.
The documentation generator inspects the default constructor, a generated type
with tracking and coercion, their prototypes, and a [`defineEnum()`](API.md#defineenumdefinitions-name) result and member.
Missing, empty or duplicate sections and unmapped public members fail verification. JavaScript expected values
and exceptions are executed; TypeScript examples are checked by the compiler,
and their annotated output is checked after compilation. These measures do not
claim all behaviours or examples are covered.

Curated mutation checks inject runtime/declaration faults into disposable copies
and require focused regressions to detect them. This is a sensitivity check, not
an exhaustive mutation score. Coverage thresholds apply to runtime source only.

The real-browser suite runs both bundles and the documented script-tag example in Chromium, Firefox and WebKit. It checks the browser global and advertised loaders, using the same packed candidate during `verify:all`. Node VM loader tests remain separate and do not establish real-browser compatibility.

No finite suite covers arbitrary callbacks, every proxy, concurrent builders, process crashes, every engine or every compiler. Benchmark timings are not correctness gates.
