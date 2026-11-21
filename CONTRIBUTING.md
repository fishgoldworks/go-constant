# Contributing

Use Node.js 22.16.0 or later within Node 22, or Node.js 24 or later. The [CI contributor pin](.nvmrc) is also suitable for local development. Install the pinned dependencies with `npm ci`. See [Runtime support](README.md#runtime-support) for consumer requirements.

The development manifest overrides affected `minimatch` versions below 11.0.1 with 11.0.4 ([advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)). Recheck this override when updating the lint tools. These development dependencies do not ship in the consumer package.

```sh
npm ci
npm run build
npm test
npm run test:types
npm run test:docs
npm run verify -- --node /path/to/node-8.0.0
```

Edit `scripts/README.template.md` for the overview and `scripts/API.template.md` for the full reference, then run `npm run docs` to generate `README.md` and `docs/API.md` with package metadata, Contents and checked API coverage. The API template owns the summary and detailed entries; the overview reuses its summary with direct reference links. `npm run test:docs` checks both outputs for freshness without writing, verifies API references and local file/fragment links, executes JavaScript examples, and compiles and executes TypeScript examples.

Link validation also checks current Markdown guides under `docs/`, the root contributor/agent/changelog/licence documents and `benchmarks/README.md`. Nested `temp/` and `.tmp/` experiments, frozen benchmark baselines and `docs/performance-history/` reports remain outside that inventory. Generated document text takes precedence over filesystem copies while validating links, so documentation-only regeneration can repair stale outputs.

The `coverage` badge means executable source-line coverage measured by `npm run coverage`. The command enforces 100% lines, branches and functions and requires a coverage entry for every maintained JavaScript module under `src/`, including nested modules. Build tooling and local experiments are outside this measure. The `docs` badge measures the proportion of public functions, attached methods and properties with checked reference sections, including factory calls and construction with `new`. The generator inspects [`Constant`](docs/API.md#constantvalue-name) and a generated type with tracking and coercion enabled, their prototypes, and a [`defineEnum()`](docs/API.md#defineenumdefinitions-name) result and member. It rejects unmapped API members, missing or duplicate reference sections, and sections without explanatory text. Documentation coverage does not mean every example or possible behaviour is tested. Source-line coverage is not branch coverage or a correctness guarantee.

## Verification and release candidates

`npm run verify` checks documentation, source coverage, declarations, build recovery, distribution artefacts, release/benchmark tooling and mutation regressions. It builds and packs one candidate, then verifies those same bytes in isolated modern and Node.js 8.0.0 consumers. Pass the floor executable with `--node` or the `GO_CONSTANT_NODE8` environment variable; verification fails if the executable is missing or its version is not exactly 8.0.0. `npm run verify:all` adds Chromium, Firefox and WebKit execution against that same archive. Install browser binaries with `npx --no-install playwright install chromium firefox webkit` after `npm ci`.

To retain a candidate for manual review or repeat a consumer check:

```sh
npm run pack:package -- --destination artifacts
npm run test:package -- --tarball artifacts/go-constant-2.0.0.tgz
npm run test:package -- --tarball artifacts/go-constant-2.0.0.tgz --node /path/to/node-8.0.0
npm run verify:all -- --tarball artifacts/go-constant-2.0.0.tgz --node /path/to/node-8.0.0
```

`pack:package` builds fresh output, creates the candidate and reports its SHA-256 digest, also saved beside the archive as `.tgz.sha256`. It writes to the ignored `artifacts/` directory by default; `--destination` selects another directory. Packing alone does not run the full verification gate.

Keep pack destinations and retained archives outside generated `package/`, including filesystem aliases into that directory. These paths are checked before building; broken aliases are rejected, while new directories below valid external destinations are allowed. Packing explicitly disables inherited npm dry-run and requires a fresh archive from a unique staging directory. It validates gzip integrity, tar headers/end blocks, package identity and the reported file inventory before replacing the previous archive/checksum pair. Ordinary replacement failures restore the old files; failed rollback retains the recovery directory and reports both causes. If staging cleanup fails after installation, the error reports `committed: true` and the active tarball path without attempting an unsafe rollback. The pack and verification CLIs retain nested errors and structured recovery information.

`test:package` consumes the supplied tarball without building or packing; a missing archive fails. It always runs the complete modern-Node checks. Optional `--node` adds the compatible consumer regressions on that executable, plus native ES module and emitted TypeScript checks on the supported Node 12.17+ release line or Node 14+. Archive-based checks validate the gzip, tar structure and package identity before installation. They verify the checksum sidecar when present and reject changes to the archive during testing.

The release gate checks that every required npm script exists and disables npm’s permissive missing-script setting. A supplied `--tarball` lets `verify` and `verify:all` reuse a retained candidate from a clean checkout. The verifier builds the checkout for comparison, then compares every installed candidate file byte for byte with that build. A mismatch fails the release gate. Record the checkout revision and relevant working-tree changes alongside the archive digest. Use `test:package` for a standalone consumer check without a local build. Keep intentional review candidates in `artifacts/` and disposable output in a temporary directory.

To install a local build in another project, use the tarball path:

```sh
npm install /absolute/path/to/go-constant/artifacts/go-constant-2.0.0.tgz
```

The private development root generates a self-contained `package/` directory. `scripts/package-layout.js` owns consumer metadata, focused import wrappers and the npm allowlist. Builds copy authored entries, declarations, runtime sources and consumer documents, and generate bundles under `package/dist/`. For a local directory dependency or link, build first and target `/absolute/path/to/go-constant/package`; ordinary root packing and publication fail with instructions to use the release workflow.

## What the checks cover

`npm test` runs the source contract, import-identity and executable documentation tests. `test:types` checks Node-style resolution, ESM/bundler resolution, browser globals, every README/API TypeScript example, and emitted TypeScript/runtime regressions. Optional-configuration and dynamic-schema fixtures also enable `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature`.

The source runner rejects an empty core-test inventory, filters that execute no active tests, and selected files that exit before completing. It clears inherited `NODE_TEST_CONTEXT` before starting Node and reconciles structured worker summaries with the final totals independently of the visible reporter. Name filters, shards, additional positional files, explicit skips and reporter/destination options retain Node's behaviour, provided at least one active test completes and every selected file finishes normally. Inherited reporter settings are combined with CLI settings while unrelated `NODE_OPTIONS` flags remain in place. The maintained gate requires process isolation; use native `node --test` directly for custom nonisolated experiments.

`test:artifacts` repeats the runtime contract against both bundles and exercises UMD loader modes. It checks readable/minified map references, composed source identity and embedded content after normalising line endings. Corruption and uncomposed-map regressions reject mismatches; build tests also decode representative mappings back to bundled source lines. `test:package` installs its archive offline into an isolated consumer, checks its file inventory and documentation links, executes the installed README/API examples, and exercises the public imports, runtime and declarations. The shared discovery rule in `test/helpers/runtime-files.js` keeps new core runtime tests included in source and modern bundle/package checks; the Node 8 consumer check uses a compatible regression harness.

`test:tooling` checks benchmark commands, the browser harness, coverage inventory, ESLint scope and conditional-return enforcement, ignore rules and mutation target selection. `test:release` checks candidate reuse, unsafe paths/aliases, fresh packing under inherited dry-run, archive/checksum replacement and recovery, digest validation, rejection of stale payloads and the private-root pack guard. Consumer cleanup attempts all owned operations and preserves both the original verification failure and any cleanup failures; the CLI reports their nested causes. Documentation generation and executable-example tests live under `test/docs/`; source, documentation and installed-package commands reuse the same example suite.

`test:mutations` injects selected runtime/declaration faults into disposable copies and requires the focused regressions to detect each one. It leaves the working library unchanged and writes evidence to a fresh temporary directory or the explicit `--output-dir`. The combination matrix and seeded tests are deterministic and bounded. See the [test coverage guide](https://github.com/fishgoldworks/go-constant/blob/master/docs/test-coverage.md) for the scenarios and limitations.

Node VM tests cover browser loader behaviour; they do not establish real-browser compatibility. CI publishes the verified archive and its checksum together. Each dependent job checks the sidecar and the producer’s digest before installing the archive. Check actual command output for the runtime versions and results of a particular run.

The separate contributor-floor CI job keeps Node 22.16.0 active for installation and the complete non-browser `verify` gate. It downloads the same candidate and checksum from the primary job, then checks that archive against a fresh floor-runtime build without repacking. Exact Node 8.0.0 runs the consumer checks through `GO_CONSTANT_NODE8`; it does not run the contributor tools.

## Build ownership and recovery

`npm run build` regenerates the README and API reference from their canonical templates, then produces the complete distribution before replacing prior output. Documentation failures preserve the previous package. It uses an explicit module dependency table and Terser; update `scripts/build.js` when internal imports change. Terser owns minification and TypeScript owns declaration checks, so this bundler needs no parser dependency. The native ESM wrapper and minified source map are retained for consumers.

Both bundles and their source maps are generated in a staging directory and pass loader smoke tests before the complete `package/` directory is replaced. The previous output is moved to a backup. A preparation failure leaves it available; an installation failure attempts rollback. If rollback also fails, the error reports the retained backup and both failures. Cleanup failures preserve the original error and any recovery path. This recovery does not protect concurrent builds or process/system crashes.

`npm run build -- --check` compares all generated bytes and rejects stale, missing or unexpected files. Run `npm run build` before standalone artefact checks. `verify` owns the release preparation steps and both root lifecycle hooks reject packing or publication from the development directory.

See [Migration guide](docs/migration.md) and [CHANGELOG.md](CHANGELOG.md) for the 2.0 changes.

Documentation checks execute the README/API examples and their `// =>` results, including expected exceptions. Browser examples also run in the real-browser distribution suite.

The documentation and installed-package checks use the shared README checker in `scripts/lib/check-library-readme.cjs`. Refresh that copy from `Instructions/check-library-readme.cjs` when the shared checker changes.

Both `README.md` and `docs/API.md` ship in the consumer archive and are checked against the authored files during installed-package verification.

## Executable code quality

Run `npm run lint` and `npm run format:check`; `npm run format` runs Prettier write, the selected ESLint readability fixes, then a read-only Prettier check. Verification and CI include these read-only checks in the release gate. The [development manifest](package.json) and [lockfile](package-lock.json) own the ESLint, TypeScript ESLint, globals and Prettier versions; [ESLint configuration](eslint.config.mjs) and [Prettier configuration](.prettierrc.json) own their rules. The pinned tools support the documented contributor runtime; they do not change consumer compatibility.

The baseline checks maintained JavaScript, tooling and tests, with explicit module/host environments, and parses TypeScript declarations and consumer fixtures. Compiler checks remain responsible for declaration semantics. Intentional public `any` types, import-equals declarations, structural empty-object types and unused compiler-only bindings retain narrow TypeScript-scope exceptions: changing those contracts solely for lint would alter supported consumers or remove negative cases. JavaScript still checks undefined and unused bindings; caught error bindings remain allowed for old-runtime syntax compatibility. Review these scopes when the related contracts change.

ESLint requires braces around conditional returns in maintained JavaScript and TypeScript, including tests and tooling. Prettier puts those returns on their own lines.

The [readability configuration](scripts/readability.mjs) separates documented units before their JSDoc, declaration groups from following work, completed blocks and final returns. Related declarations, imports and assertions can remain compact. A narrow upstream-rule adapter moves a required gap before a trailing ESLint or TypeScript next-line directive and its comment chain, preserving its target. The [private formatter](scripts/format.mjs) uses the complete ESLint configuration, permits only the two reviewed spacing rules to fix code, prints all other diagnostics and fails when any remain. Ordinary lint diagnostics still receive the final Prettier check. It anchors to the repository root, works through directory junctions and accepts no arguments. Use `lint:fix` deliberately for broader fixes.

Leave a blank line between test cases and suites, including awaited subtests and generated groups, and between distinct setup/assertion phases inside a test. A scoped ESLint rule checks adjacent declarations from `node:test`, stable aliases, simple returning wrappers defined after their test binding, and test-context subtests. It reports missing separators without autofixing them, so authors can preserve directive targets and choose the right grouping. Other wrappers and phase boundaries still require review; assertion groups do not need a blank line between every assertion.

The selected fixes preserve physical `node:coverage`, `c8` and `v8` ignore-next spans, including explicit line counts. If a required separator would change such a span, its fix is refused and the lint diagnostic remains for explicit layout/directive reconciliation. Both selected rules receive this protection; no coverage count is rewritten or diagnostic hidden. Coverage interpreters differ on trailing comments, so coverage markers remain on their original lines. This protection applies to the selected ESLint edits after Prettier normalization. Prettier can itself reflow physical line counts, as it did before this workflow; reconcile counted spans explicitly or use a suitable formatter-ignore arrangement, then run the actual coverage gate.

The [readability tests](test/tooling/readability.test.mjs) run in `test:tooling` and normal verification. They cover missing documentation separators, supported parser scopes, directives and compiler controls, real CLI execution, junctions, exclusions, unrelated diagnostics and two-cycle stability. The externally owned canonical README checker retains correctness lint with spacing and conditional-return exceptions; its exact bytes are checked by repository and installed-package documentation checks. Review that exception only when refreshing the canonical copy.

Prettier formats maintained JavaScript/TypeScript, configuration, Markdown and documentation templates. [Formatter exclusions](.prettierignore) cover generated distributions and documents, dependency/coverage output, locked or vendored data and historical evidence. Scoped `<!-- prettier-ignore -->` comments preserve aligned result examples; canonical documentation generation and executable-example checks still validate their results. Generated files must still pass their artefact freshness checks. No playbook modules or configuration dependency are imported.

## TypeScript compatibility

The TypeScript 5.4 intrinsic NoInfer preserves validator, field and coercion inference. A conditional-type substitute loses those guarantees on older compilers, so the 5.4 requirement remains.

Run `npm run test:types -- --compiler /path/to/typescript/lib/tsc.js --package /path/to/installed/go-constant` to check an external compiler against a built or installed package. The default uses the pinned development compiler. The same inference and rejection fixtures are reused for the supported minimum (5.4.5), the pinned compiler and TypeScript 6.0.3; CI checks the exact candidate tarball with all three. The intentional script-global fixture retains `module: None` and `moduleResolution: Classic`; TypeScript 6 receives a scoped deprecation acknowledgement for those options. Legacy checks adapt fixture extensions and import syntax only where needed. Node16/NodeNext, Bundler and exact optional properties remain enabled in the configurations that support them.

Local experiments in `temp/` and `.tmp/` directories at any depth are ignored by Git, ESLint and Prettier. The build copies only its maintained file allowlist, and runtime tests discover only maintained top-level suites; experiments are excluded from the package and source coverage.
