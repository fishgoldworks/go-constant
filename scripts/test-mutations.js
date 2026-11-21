'use strict';

// Curated fault injection, not a claim of exhaustive mutation coverage. Mutants
// exist only in disposable copies. The shipped source is never edited here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const newTests = require('../test/helpers/runtime-files.js').filter((file) =>
  /(?:-edge|combinations|optimization)\.test\.js$/.test(file)
);
// Keep new runs separate from checked-in historical verification evidence.
const args = process.argv.slice(2);

if (args.length && (args.length !== 2 || args[0] !== '--output-dir' || args[1].startsWith('--')))
  throw Error('Usage: node scripts/test-mutations.js [--output-dir <directory>]');
const output = args.length ? path.resolve(args[1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-mutations-'));

console.log('Mutation evidence: ' + output);
fs.mkdirSync(output, { recursive: true });
const runtimeMutants = [
  [
    'wrapper-new-reuses-instance',
    'src/Constant.js',
    [['!new.target && arguments.length === 1', 'arguments.length === 1']]
  ],
  [
    'wrapper-reuse-with-extra-arguments',
    'src/Constant.js',
    [['arguments.length === 1 && value instanceof Constant', 'value instanceof Constant']]
  ],
  [
    'wrapper-uses-call-receiver',
    'src/Constant.js',
    [['new.target ? this : Object.create(Constant.prototype)', 'this || Object.create(Constant.prototype)']]
  ],
  ['wrapper-writable-value', 'src/Constant.js', [['writable: false, value }', 'writable: true, value }']]],
  ['wrapper-wrong-coercion', 'src/Constant.js', [['return this.value;', 'return this.name;']]],
  [
    'value-stringification',
    'src/Constant.js',
    [['writable: false, value }', 'writable: false, value: String(value) }']]
  ],
  ['falsy-names', 'src/Constant.js', [['inputName == null ? null', '!inputName ? null']]],
  ['writable-fields', 'src/defineType.js', [['                writable: false,', '                writable: true,']]],
  [
    'configurable-fields',
    'src/defineType.js',
    [['configurable: false, writable: false, value: args[i]', 'configurable: true, writable: false, value: args[i]']]
  ],
  [
    'hidden-fields',
    'src/defineType.js',
    [
      [
        'enumerable: true, configurable: false, writable: false, value: args[i]',
        'enumerable: false, configurable: false, writable: false, value: args[i]'
      ]
    ]
  ],
  [
    'reuse-with-extra-arguments',
    'src/defineType.js',
    [['arguments.length === 1 && arg instanceof ConstantType', 'arg instanceof ConstantType']]
  ],
  [
    'new-reuses-instance',
    'src/defineType.js',
    [
      [
        'if (new.target) { return initialize(this, arguments); }',
        'if (new.target) { if (arguments.length === 1 && arg instanceof ConstantType) return arg; return initialize(this, arguments); }'
      ]
    ]
  ],
  ['last-field-omitted', 'src/defineType.js', [['i < fieldCount;', 'i < fieldCount - 1;']]],
  [
    'caller-schema-used-lazily',
    'src/defineType.js',
    [['Object.defineProperty(instance, fields[i],', 'Object.defineProperty(instance, propNames[i],']]
  ],
  [
    'validator-option-read-lazily',
    'src/defineType.js',
    [['Reflect.apply(validate, instance, originalArgs)', 'Reflect.apply(options.validate, instance, originalArgs)']]
  ],
  ['selector-option-read-lazily', 'src/defineType.js', [['return this[valueOf];', 'return this[options.valueOf];']]],
  ['live-registry-exposed', 'src/defineType.js', [['return instances.slice();', 'return instances;']]],
  [
    'registry-order-reversed',
    'src/defineType.js',
    [['return instances.slice();', 'return instances.slice().reverse();']]
  ],
  [
    'registration-before-validation',
    'src/defineType.js',
    [
      [
        '        const normalized =',
        '        if (instances !== null) instances.push(instance);\n        const normalized ='
      ],
      [
        '        if (instances !== null) { instances.push(instance); }\n        return instance;',
        '        return instance;'
      ]
    ]
  ],
  ['hidden-options-ignored', 'src/defineType.js', [['Reflect.ownKeys(options)', 'Object.keys(options)']]],
  ['inherited-schema-index-accepted', 'src/defineType.js', [['!hasOwn(propNames, i)', '!(i in propNames)']]],
  [
    'normalized-extra-slots-read',
    'src/defineType.js',
    [['originalArgs : normalized;', 'originalArgs : normalized.slice();']]
  ],
  [
    'empty-normalization-discarded',
    'src/defineType.js',
    [['const args = normalized === undefined ?', 'const args = normalized === undefined || normalized.length === 0 ?']]
  ],
  [
    'validator-receiver-lost',
    'src/defineType.js',
    [['Reflect.apply(validate, instance, originalArgs)', 'Reflect.apply(validate, undefined, originalArgs)']]
  ],
  [
    'array-like-output-accepted',
    'src/defineType.js',
    [
      [
        'normalized !== undefined && !Array.isArray(normalized)',
        "normalized !== undefined && (normalized === null || typeof normalized !== 'object')"
      ]
    ]
  ],
  ['inherited-options-used', 'src/defineType.js', [['hasOwn(options, key)', 'key in options']]]
];
const typeMutants = [
  ['mutable-wrapper-types', 'index.d.ts', [['readonly value: T;', 'value: T;']]],
  [
    'void-treated-as-undefined',
    'index.d.ts',
    [['R extends undefined ? A : readonly unknown[]', 'R extends undefined ? A : A']]
  ],
  ['structural-generated-reuse', 'index.d.ts', [['(...args: A): I; new', '(instance: I): I; (...args: A): I; new']]],
  [
    'structural-wrapper-identity',
    'index.d.ts',
    [
      [
        'type Value<T = unknown> = ConstantValue<T>;',
        'type Value<T = unknown> = Pick<ConstantValue<T>, "value" | "name" | "valueOf">;'
      ]
    ]
  ],
  [
    'mutable-record-types',
    'index.d.ts',
    [
      [
        'type RequiredFields<K extends readonly FieldKey[], A extends readonly unknown[]> = {\n        readonly [I in keyof K as',
        'type RequiredFields<K extends readonly FieldKey[], A extends readonly unknown[]> = {\n        -readonly [I in keyof K as'
      ]
    ]
  ],
  [
    'optional-normalizer-assumed-present',
    'index.d.ts',
    [
      [
        'O extends { validate: (...args: never[]) => unknown; } ? Normalized<A, R> : Normalized<A, R | undefined>',
        'Normalized<A, R>'
      ]
    ]
  ],
  ['disabled-snapshot-assumed-enabled', 'index.d.ts', [['[T] extends [false | undefined] ? never : I[]', 'I[]']]],
  ['optional-coercion-assumed-present', 'index.d.ts', [['O extends { valueOf: unknown } ? S : S | undefined', 'S']]],
  [
    'uncertain-schema-keys-required',
    'index.d.ts',
    [['true extends IsUnion<K> ? false :\n        {} extends Record<K, never> ? false : true', 'true']]
  ],
  [
    'wide-key-values-ignore-fixed-fields',
    'index.d.ts',
    [['K[I] extends FieldKey ? MatchingValues<K, A, K[I]> : never', 'K[I] extends FieldKey ? At<A, I> : never']]
  ],
  // Match the conditional tail so member JSDoc does not affect the fault target.
  [
    'data-field-null-workaround-required',
    'index.d.ts',
    [['valueOf?: null | undefined; } : unknown)', 'valueOf?: null | undefined } : { valueOf: null })']]
  ]
];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-mutations-'));
const env = { ...process.env, GO_CONSTANT_TEST_ENTRY: path.join(temporary, 'index.js') };

delete env.NODE_TEST_CONTEXT;
const files = [
  'index.js',
  'index.mjs',
  'index.d.ts',
  'index.d.mts',
  'defineEnum.d.ts',
  'src/Constant.js',
  'src/defineType.js',
  'src/defineEnum.js',
  'test/types/edge-cases.cts',
  'test/types/optional-options.cts',
  'test/types/dynamic-schema.cts'
];
const originals = new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const results = [];

function restore() {
  for (const [file, text] of originals) {
    const target = path.join(temporary, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
}

function execute(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024
  });

  if (result.error) throw result.error;

  return { status: result.status, text: result.stdout + result.stderr };
}

try {
  restore();
  const baseline = execute(['--test', '--test-reporter=tap', ...newTests]);

  assert.equal(baseline.status, 0, baseline.text);
  const compiler = require.resolve('typescript/bin/tsc');
  const typeArgs = [
    compiler,
    '--strict',
    '--noEmit',
    '--target',
    'ES2020',
    '--module',
    'Node16',
    '--moduleResolution',
    'Node16',
    '--exactOptionalPropertyTypes',
    '--noUncheckedIndexedAccess',
    '--noPropertyAccessFromIndexSignature',
    'test/types/edge-cases.cts',
    'test/types/optional-options.cts',
    'test/types/dynamic-schema.cts'
  ];
  const typeBaseline = execute(typeArgs, temporary);

  assert.equal(typeBaseline.status, 0, typeBaseline.text);
  for (const [kind, mutants] of [
    ['runtime', runtimeMutants],
    ['types', typeMutants]
  ]) {
    for (const [id, file, replacements] of mutants) {
      restore();
      let source = originals.get(file);

      for (const [before, after] of replacements) {
        source = require('./mutation-target')(source, before, after, id);
      }

      fs.writeFileSync(path.join(temporary, file), source);
      if (kind === 'runtime') {
        const syntax = execute(['--check', path.join(temporary, file)]);

        assert.equal(syntax.status, 0, `Invalid mutant ${id}: ${syntax.text}`);
      } else {
        const ts = require('typescript');

        assert.equal(
          ts.createSourceFile(file, source, ts.ScriptTarget.Latest).parseDiagnostics.length,
          0,
          `Invalid declaration mutant ${id}`
        );
      }

      const actual =
        kind === 'runtime' ? execute(['--test', '--test-reporter=tap', ...newTests]) : execute(typeArgs, temporary);
      const failures =
        kind === 'runtime'
          ? Number(/# fail (\d+)/.exec(actual.text)?.[1])
          : (actual.text.match(/error TS\d+/g) || []).length;
      const passed = kind === 'runtime' ? Number(/# pass (\d+)/.exec(actual.text)?.[1]) : null;
      // Timeouts, parse failures, and inability to load modules are not counted as kills.
      const detected = actual.status !== 0 && failures > 0 && (kind !== 'runtime' || passed > 0);
      const diagnostics = actual.text
        .split('\n')
        .filter((line) => /^(not ok|# (tests|pass|fail))|error TS\d+/.test(line));

      fs.writeFileSync(path.join(output, `mutation-${id}.log`), diagnostics.join('\n') + '\n');
      results.push({ id, kind, detected, failures, passed, diagnostics });
      console.log(`${detected ? 'DETECTED' : 'SURVIVED'} ${kind}: ${id} (${failures} failing checks)`);
    }
  }

  fs.writeFileSync(
    path.join(output, 'mutations.json'),
    JSON.stringify({ baselineNewRuntimeTests: Number(/# tests (\d+)/.exec(baseline.text)[1]), results }, null, 2) + '\n'
  );
  assert.ok(
    results.every((result) => result.detected),
    'Some curated faults escaped the new regression tests; inspect mutations.json'
  );
  console.log(`Detected ${results.length}/${results.length} curated faults using only the added regression tests.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
