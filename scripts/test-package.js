'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const metadata = require('./package-layout').consumerManifest();
const root = path.resolve(__dirname, '..');
const { readCandidate, options } = require('./package-file.js');
const runCleanups = require('./cleanup');

function run(args, cwd = root, overrides = {}, executable = process.execPath) {
  const env = { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', ...overrides };

  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env,
    maxBuffer: 4 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Command failed (${result.status}): ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);

  return result.stdout;
}

function main() {
  const args = options(process.argv.slice(2), ['tarball', 'node', 'compare-package']);
  const candidate = readCandidate(args.tarball);

  console.log('Testing supplied tarball: ' + candidate.tarball + '\nSHA-256: ' + candidate.sha256);
  const npm = process.env.npm_execpath;

  if (!npm) throw new Error('Run this check with npm run test:package.');
  const compiler = process.env.TYPESCRIPT_COMPILER || require.resolve('typescript/bin/tsc');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-consumer-'));
  const errors = [];

  try {
    fs.writeFileSync(
      path.join(temporary, 'package.json'),
      JSON.stringify({ name: 'go-constant-consumer', private: true })
    );
    run([npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', candidate.tarball], temporary);
    const installed = path.join(temporary, 'node_modules/go-constant');
    const packedMetadata = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
    const manifestMessage = 'Installed consumer manifest must match the canonical manifest';

    assert.deepEqual(packedMetadata, metadata, manifestMessage);
    // Conditional export key order affects resolution even when values are equal.
    assert.equal(JSON.stringify(packedMetadata.exports), JSON.stringify(metadata.exports), manifestMessage);
    const canonicalLicence = fs.readFileSync(path.join(root, 'LICENSE.md'), 'utf8');

    assert.equal(fs.readFileSync(path.join(installed, 'LICENSE.md'), 'utf8'), canonicalLicence);
    assert.match(canonicalLicence, /Permission is hereby granted, free of charge/);
    const notice = canonicalLicence.replace(/\r\n?/g, '\n').trim();

    for (const name of ['go-constant.js', 'go-constant.min.js']) {
      const bundle = fs.readFileSync(path.join(installed, 'dist', name), 'utf8');

      assert.ok(
        bundle.startsWith(`/*! ${metadata.name} v${metadata.version}\n${notice}\n*/`),
        name + ': licence notice'
      );
    }

    function inventory(directory, prefix = '') {
      return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const relative = prefix + entry.name;

        return entry.isDirectory() ? inventory(path.join(directory, entry.name), relative + '/') : [relative];
      });
    }

    const paths = inventory(installed);

    assert.deepEqual(
      paths.sort(),
      [...metadata.files, 'package.json'].sort(),
      'Installed tarball must match the consumer file allowlist exactly.'
    );
    if (args['compare-package']) {
      for (const file of paths) {
        const expected = fs.readFileSync(path.resolve(args['compare-package'], file));
        const actual = fs.readFileSync(path.join(installed, file));

        assert.ok(actual.equals(expected), 'Candidate differs from the checked build: ' + file);
      }

      console.log('Installed candidate payload matches the checked build byte for byte.');
    }

    console.log('Installed ' + paths.length + ' consumer files from the supplied tarball (offline).');
    fs.copyFileSync(path.join(root, 'test/package/consumer-node.js'), path.join(temporary, 'consumer-node.js'));
    process.stdout.write(run(['consumer-node.js'], temporary));
    if (args.node) process.stdout.write(run(['consumer-node.js'], temporary, {}, args.node));
    const documents = {};

    for (const document of ['README.md', 'docs/API.md', 'CHANGELOG.md', 'docs/migration.md']) {
      const prose = fs.readFileSync(path.join(installed, document), 'utf8');

      documents[document] = prose;
      assert.equal(
        prose.replace(/\r\n/g, '\n'),
        fs.readFileSync(path.join(root, document), 'utf8').replace(/\r\n/g, '\n'),
        'Stale packaged documentation: ' + document
      );
      for (const [, link] of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        if (/^(?:[a-z]+:|#)/i.test(link)) continue;
        assert.ok(
          fs.existsSync(path.resolve(installed, path.dirname(document), link.split('#')[0])),
          document + ': missing packed link ' + link
        );
      }
    }

    require('./documentation-documents').validateLinks(documents, installed);
    require('./lib/check-library-readme.cjs').checkPackage(installed);

    fs.writeFileSync(
      path.join(temporary, 'consumer.cjs'),
      `
"use strict";
const assert = require("node:assert/strict");
const Constant = require("go-constant");
const Type = Constant.defineType("Priority", ["code"], { trackInstances: true });
const item = Type("normal");
assert.equal(Type.getInstances()[0], item);
assert.equal('instances' in Type, false);
const existing = Constant(42, "Answer");
assert.equal(Constant(existing), existing);
assert.equal(Constant(existing, "Wrapped").value, existing);
assert.equal(require("go-constant/package.json").version, ${JSON.stringify(metadata.version)});
assert.equal(Object.keys(require("go-constant/package.json").dependencies || {}).length, 0);
for (const name of ["go-constant.js", "go-constant.min.js"]) {
    const Bundled = require("go-constant/dist/" + name);
    assert.equal(Bundled(4).valueOf(), 4);
}
assert.throws(() => require("go-constant/newType"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
assert.throws(() => require("go-constant/src/defineType"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
`
    );
    fs.writeFileSync(
      path.join(temporary, 'consumer.mjs'),
      `
import assert from "assert";
import Constant, { Constant as namedConstant, defineEnum as rootEnum, defineType } from "go-constant";
import constantDefault, { Constant as focusedConstant } from "go-constant/Constant";
import typeDefault, { defineType as focusedDefineType } from "go-constant/defineType";
import enumDefault, { defineEnum } from "go-constant/defineEnum";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
assert.equal(Constant, require("go-constant"));
assert.equal(namedConstant, Constant);
assert.equal(constantDefault, Constant);
assert.equal(focusedConstant, Constant);
assert.equal(require("go-constant/Constant"), Constant);
assert.equal(defineType, Constant.defineType);
assert.equal(typeDefault, defineType);
assert.equal(focusedDefineType, defineType);
assert.equal(require("go-constant/defineType"), defineType);
assert.equal(enumDefault, defineEnum);
assert.equal(defineEnum, Constant.defineEnum);
assert.equal(defineEnum, rootEnum);
assert.equal(defineEnum, require("go-constant/defineEnum"));
const item = Constant(42);
assert.equal(require("go-constant")(item), item);
`
    );
    run(['consumer.cjs'], temporary);
    run(['consumer.mjs'], temporary);
    if (args.node) {
      const supportsEsm = require('./runtime-support')(run(['--version'], temporary, {}, args.node));

      if (supportsEsm) {
        run(['consumer.mjs'], temporary, {}, args.node);
        console.log('Native ESM/default/named imports also pass on the supplied runtime.');
      }
    }

    console.log('Installed CommonJS, ESM, named exports, shared identity, and browser bundle subpaths pass.');

    fs.writeFileSync(
      path.join(temporary, 'consumer.cts'),
      `
import Constant = require("go-constant");
const value = Constant(42, "Answer");
const n: number = value.value;
// @ts-expect-error declared fields are read-only
value.value = 2;
const Level = Constant.defineType("Level", ["code", "rank"] as const, {
    trackInstances: true,
    valueOf: "rank",
    validate(code: string, rank: number) { return [code.trim(), rank] as const; }
});
const high = Level("high", 3);
const rank: number = high.valueOf();
const code: string = Level.getInstances()[0].code;
// @ts-expect-error wrong constructor argument
Level(3, "high");
const copied = { ...value };
const copyInput: typeof copied = Constant(copied).value;
// @ts-expect-error spread copies are not reusable Constant instances
Constant(copied).value.toFixed(2);
// @ts-expect-error matching record fields cannot prove constructor identity
Level(high);
const Typed = Constant.defineType<["code", "rank"], [string, number]>(
    "Typed", ["code", "rank"], { trackInstances: true, valueOf: "rank" }
);
const typedRank: number = Typed("high", 3).rank;
Typed.getInstances().reverse();
const erased: (code: string) => void = code => [code.length];
const Erased = Constant.defineType("Erased", ["code"], { validate: erased });
// @ts-expect-error erased normalization cannot promise an unchanged string
const falselyString: string = Erased("abc").code;
`
    );
    fs.writeFileSync(
      path.join(temporary, 'consumer.mts'),
      `
import Constant, { defineType } from "go-constant";
import type { Value } from "go-constant";
const value: Value<number> = Constant(1);
const Item = defineType("Item", ["code"] as const);
const unknownCode: unknown = Item("anything").code;
// @ts-expect-error untyped field names do not imply value types
const invalid: string = Item("anything").code;
`
    );
    const shared = ['--strict', '--noEmit', '--target', 'ES2020', '--skipLibCheck', 'false'];

    run(
      [compiler, ...shared, '--module', 'Node16', '--moduleResolution', 'Node16', 'consumer.cts', 'consumer.mts'],
      temporary
    );
    run([compiler, ...shared, '--module', 'ESNext', '--moduleResolution', 'Bundler', 'consumer.mts'], temporary);
    console.log('Installed declarations pass strict CommonJS/ESM and bundler-mode consumer checks.');

    // Reuse the full core suite against the installed package, not merely the
    // working tree. Source/import-only integration tests are excluded by the
    // same discovery rule used for the two browser bundles.
    const runtimeFiles = require('../test/helpers/runtime-files.js');
    const runtimeOutput = run(['--test', '--test-reporter=tap', ...runtimeFiles], root, {
      GO_CONSTANT_TEST_ENTRY: path.join(temporary, 'node_modules/go-constant/index.js')
    });

    assert.match(runtimeOutput, /# fail 0/);
    const runtimeCount = /# tests (\d+)/.exec(runtimeOutput);

    assert.ok(runtimeCount && Number(runtimeCount[1]) >= 419);
    console.log(`Installed package passes all ${runtimeCount[1]} core runtime tests.`);
    const artefactOutput = run(['--test', '--test-reporter=tap', 'test/artifacts.test.js'], root, {
      GO_CONSTANT_DIST_DIR: path.join(installed, 'dist')
    });

    assert.match(artefactOutput, /# fail 0/);
    console.log(
      'Installed readable/minified bundles pass both complete runtime suites, loader checks and source-map checks.'
    );

    for (const fixture of ['edge-cases.cts', 'optional-options.cts', 'dynamic-schema.cts']) {
      const boundaryFixture = fs
        .readFileSync(path.join(root, 'test/types', fixture), 'utf8')
        .replace(/require\((["'])\.\.\/\.\.\/index\.js\1\)/g, 'require("go-constant")');

      fs.writeFileSync(path.join(temporary, fixture), boundaryFixture);
      if (fixture === 'dynamic-schema.cts') {
        run([compiler, ...shared, '--module', 'Node16', '--moduleResolution', 'Node16', fixture], temporary);
      }

      for (const exactOptionalPropertyTypes of ['false', 'true']) {
        run(
          [
            compiler,
            ...shared,
            '--module',
            'Node16',
            '--moduleResolution',
            'Node16',
            '--exactOptionalPropertyTypes',
            exactOptionalPropertyTypes,
            '--noUncheckedIndexedAccess',
            '--noPropertyAccessFromIndexSignature',
            fixture
          ],
          temporary
        );
      }
    }

    console.log('Installed package passes declaration boundaries with both optional-property modes.');

    const executionFixture = fs
      .readFileSync(path.join(root, 'test/types/runtime.cts'), 'utf8')
      .replace(/require\((["'])\.\.\/\.\.\/index\.js\1\)/g, 'require("go-constant")');

    fs.writeFileSync(path.join(temporary, 'runtime.cts'), executionFixture);
    run(
      [
        compiler,
        '--strict',
        '--noEmitOnError',
        '--target',
        'ES2020',
        '--module',
        'Node16',
        '--moduleResolution',
        'Node16',
        '--outDir',
        'compiled',
        'runtime.cts'
      ],
      temporary
    );
    process.stdout.write(run(['compiled/runtime.cjs'], temporary));
    for (const extension of ['cts', 'mts']) {
      fs.writeFileSync(
        path.join(temporary, 'default-import.' + extension),
        `
import Constant, { defineType } from "go-constant";
const number: number = Constant(42).value;
if (number !== 42 || defineType !== Constant.defineType) throw new Error("Broken default import");
const Item = defineType("Item", ["rank"] as const, { valueOf: "rank", validate(rank: number) { return [rank] as const; } });
if (Item(7).valueOf() !== 7) throw new Error("Broken named import");
`
      );
    }

    run(
      [
        compiler,
        '--strict',
        '--noEmitOnError',
        '--esModuleInterop',
        '--target',
        'ES2015',
        '--module',
        'Node16',
        '--moduleResolution',
        'Node16',
        '--outDir',
        'compiled-default',
        'default-import.cts',
        'default-import.mts'
      ],
      temporary
    );
    run(['compiled-default/default-import.cjs'], temporary);
    run(['compiled-default/default-import.mjs'], temporary);
    if (args.node) {
      run(['compiled-default/default-import.cjs'], temporary, {}, args.node);
      const supportsEsm = require('./runtime-support')(run(['--version'], temporary, {}, args.node));

      if (supportsEsm) run(['compiled-default/default-import.mjs'], temporary, {}, args.node);
    }

    console.log('Compiled TypeScript default and named imports execute in CommonJS and native ESM.');
    const documentationOutput = run(
      ['--test', '--test-reporter=tap', 'test/docs/documentation-examples.test.js'],
      root,
      {
        GO_CONSTANT_PACKAGE_ROOT: installed
      }
    );

    assert.match(documentationOutput, /# fail 0/);
    process.stdout.write(run(['scripts/test-readme-types.js'], root, { GO_CONSTANT_PACKAGE_ROOT: installed }));
    console.log(
      'Installed README/API JavaScript, import, browser and TypeScript examples execute with their documented results.'
    );

    assert.equal(readCandidate(candidate.tarball).sha256, candidate.sha256, 'Candidate changed while testing');
  } catch (error) {
    errors.push(error);
  }

  runCleanups([() => fs.rmSync(temporary, { recursive: true, force: true })], errors);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
