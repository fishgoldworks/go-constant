'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { render, generate, documentationCoverage } = require('../../scripts/docs.js');
const Constant = require('../../index.js');
const template = fs.readFileSync(path.join(__dirname, '../../scripts/API.template.md'), 'utf8');
const references = template.slice(template.indexOf('## API summary'));
const overview = fs.readFileSync(path.join(__dirname, '../../scripts/README.template.md'), 'utf8');
const pkg = {
  name: 'fixture',
  version: '2.3.4',
  license: 'MIT',
  devDependencies: { typescript: '5.8.3' }
};

test('repository README and contributor guide follow the shared conventions', () => {
  require('../../scripts/lib/check-library-readme.cjs').checkRepository(path.resolve(__dirname, '../..'));
});

test('renders metadata and heading links without changing authored examples', () => {
  const template =
    '# Fixture\n{{VERSION}} {{LICENSE}}\n{{TOC}}\n## Hello world\n```js\n## not a heading\nconsole.log(123);\n```\n## Hello world\n';
  const output = render(template, pkg);

  assert.match(output, /2\.3\.4 MIT/);
  assert.match(output, /\[Hello world\]\(#hello-world\)/);
  assert.match(output, /\[Hello world\]\(#hello-world-1\)/);
  assert.ok(output.includes('## not a heading\nconsole.log(123);'));
  assert.ok(!output.includes('[not a heading]'));
});

test('rejects unresolved template metadata', () => {
  assert.throws(() => render('{{UNKNOWN}}', pkg), /Unknown documentation token/);
});

test('generation is repeatable and check rejects drift without writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-command-'));

  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const file of ['docs/migration.md', 'CHANGELOG.md', 'LICENSE.md']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(__dirname, '../..', file), path.join(root, file));
    }

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(
      path.join(root, 'scripts/API.template.md'),
      '# Fixture\n{{VERSION}}\n{{TOC}}\n## Usage\ntext\n' + references
    );
    fs.writeFileSync(path.join(root, 'scripts/README.template.md'), overview);
    generate({ root });
    const before = fs.readFileSync(path.join(root, 'README.md'));

    generate({ root, check: true });
    generate({ root });

    assert.deepEqual(fs.readFileSync(path.join(root, 'README.md')), before);

    const apiFile = path.join(root, 'docs/API.md');
    const apiOriginal = fs.readFileSync(apiFile, 'utf8');

    fs.writeFileSync(apiFile, 'stale API\n');

    assert.throws(() => generate({ root, check: true }), /docs\/API.md is stale/);
    assert.equal(fs.readFileSync(apiFile, 'utf8'), 'stale API\n');

    fs.writeFileSync(apiFile, apiOriginal);
    fs.appendFileSync(path.join(root, 'README.md'), '\nstale');
    const stale = fs.readFileSync(path.join(root, 'README.md'));

    assert.throws(() => generate({ root, check: true }), /README.md is stale/);
    assert.deepEqual(fs.readFileSync(path.join(root, 'README.md')), stale);

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...pkg, version: '9.0.0' }));
    generate({ root });

    assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /9\.0\.0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checks CRLF checkouts without rewriting them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-crlf-'));

  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const file of ['docs/migration.md', 'CHANGELOG.md', 'LICENSE.md']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(__dirname, '../..', file), path.join(root, file));
    }

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(root, 'scripts/API.template.md'), '# Fixture\r\n{{VERSION}}\r\n' + references);
    fs.writeFileSync(path.join(root, 'scripts/README.template.md'), overview.replace(/\r?\n/g, '\r\n'));
    generate({ root });
    const text = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\n/g, '\r\n');

    fs.writeFileSync(path.join(root, 'README.md'), text);
    generate({ root, check: true });

    assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), text);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const invalidGuide of [
  { name: 'missing files', link: '../missing.md', error: /docs\/nested\/guide\.md: missing document/ },
  { name: 'missing fragments', link: '../API.md#missing-entry', error: /docs\/nested\/guide\.md: missing fragment/ }
]) {
  test('generation rejects ' + invalidGuide.name + ' linked from maintained guides without writing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guide-'));

    try {
      fs.mkdirSync(path.join(root, 'scripts'));
      for (const file of ['docs/migration.md', 'CHANGELOG.md', 'LICENSE.md']) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.copyFileSync(path.join(__dirname, '../..', file), path.join(root, file));
      }

      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
      fs.writeFileSync(path.join(root, 'scripts/API.template.md'), template);
      fs.writeFileSync(path.join(root, 'scripts/README.template.md'), overview);
      const guides = {
        'AGENTS.md': '# Instructions\n\n[Contributor guide](CONTRIBUTING.md)\n',
        'CONTRIBUTING.md': '# Contributing\n\n[API](docs/API.md#myenumfromvalueinput)\n',
        'benchmarks/README.md': '# Benchmarks\n\n[API](../docs/API.md#myenumhasvalueinput)\n',
        'docs/nested/guide.md': '# Guide\n\n[API](../API.md#myenumfromvalueinput)\n',
        'docs/temp/experiment.md': '# Experiment\n\n[Ignored](missing.md)\n',
        'docs/nested/.tmp/experiment.md': '# Experiment\n\n[Ignored](missing.md)\n',
        'docs/performance-history/report.md': '# Historical measurement\n\n[Recorded](missing.md)\n',
        'benchmarks/baseline/README.md': '# Historical baseline\n\n[Recorded](missing.md)\n'
      };

      for (const [file, text] of Object.entries(guides)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
      }

      generate({ root });
      generate({ root, check: true });
      const readme = fs.readFileSync(path.join(root, 'README.md'));
      const guideFile = path.join(root, 'docs/nested/guide.md');
      const invalidText = '# Guide\n\n[Invalid](' + invalidGuide.link + ')\n';

      fs.writeFileSync(guideFile, invalidText);

      assert.throws(() => generate({ root, check: true }), invalidGuide.error);
      assert.equal(fs.readFileSync(guideFile, 'utf8'), invalidText);
      assert.deepEqual(fs.readFileSync(path.join(root, 'README.md')), readme);
    } finally {
      assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('docs-guide-'));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('ignores tilde and nested fences and counts anchors at every heading level', () => {
  const output = render(
    '# Shared\n{{TOC}}\n~~~~js\n## Hidden\n```\n## Hidden too\n~~~~\n## Shared\n### Shared\n## Shared\n',
    pkg
  );

  assert.ok(!output.includes('[Hidden]'));
  assert.ok(!output.includes('[Hidden too]'));
  assert.ok(output.includes('[Shared](#shared-1)'));
  assert.ok(output.includes('[Shared](#shared-3)'));
});

test('derives complete API reference coverage from callable constructors and their members', () => {
  const coverage = documentationCoverage(template, Constant);

  assert.equal(coverage.covered, 16);
  assert.equal(coverage.total, 16);
  assert.equal(coverage.percent, 100);
  assert.deepEqual(coverage.missing, []);

  const output = render(template, require('../../package.json'), Constant);

  assert.equal(documentationCoverage(output, Constant).percent, 100);
  assert.ok(
    fs.readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8').includes('docs-100%25-brightgreen.svg')
  );
  assert.ok(output.includes('[`MyType.getInstances()`](#mytypegetinstances)'));
});

test('rejects missing, duplicate, misplaced and empty API reference sections', () => {
  const heading = '### `MyType.getInstances()`';

  assert.throws(
    () => render(template.replace(heading, '### `Tracking snapshots`'), pkg, Constant),
    /Missing API detail target|Missing API reference|Missing API summary/
  );
  assert.throws(
    () => render(template.replace(heading, heading + '\nDuplicate.\n\n' + heading), pkg, Constant),
    /Missing API reference signature|Duplicate API reference/
  );
  assert.throws(
    () => render(template.replace('## API summary', '## Unrelated'), pkg, Constant),
    /Missing API detail target|Missing API reference|Missing API summary/
  );

  const begin = template.indexOf(heading) + heading.length;
  const end = template.indexOf('### `', begin);
  const empty =
    template.slice(0, begin) + '\n<!-- No explanation. -->\n```js\ngetInstances();\n```\n' + template.slice(end);

  assert.throws(() => render(empty, pkg, Constant), /no explanatory text/);

  const noSnapshots = template
    .split('\n')
    .filter((line) => !line.startsWith('| [`MyType.getInstances()'))
    .join('\n');
  const coverage = documentationCoverage(noSnapshots, Constant);

  assert.equal(coverage.covered, 15);
  assert.equal(coverage.percent, (15 * 100) / 16);
});

test('a new public member requires an explicit reference mapping', () => {
  function Changed() {
    return Reflect.construct(Constant, Array.from(arguments), Changed);
  }

  Object.defineProperties(Changed, Object.getOwnPropertyDescriptors(Constant));
  Changed.additionalMember = true;

  assert.throws(() => documentationCoverage(template, Changed), /Public API inventory changed/);
});

test('example runners use the selected package README and public exports', () => {
  const { spawnSync } = require('node:child_process');
  const repository = path.resolve(__dirname, '../..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-readme-'));

  try {
    const installed = path.join(temporary, 'node_modules', 'go-constant');

    fs.mkdirSync(installed, { recursive: true });
    for (const name of [...require('../../scripts/package-layout').consumerFiles, 'package.json']) {
      const target = path.join(installed, name);

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repository, 'package', name), target);
    }

    const filename = path.join(installed, 'README.md');
    const original = fs.readFileSync(filename, 'utf8');

    function run(args) {
      const env = { ...process.env, GO_CONSTANT_PACKAGE_ROOT: installed };

      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, args, {
        cwd: repository,
        encoding: 'utf8',
        timeout: 30000,
        env
      });

      assert.ifError(result.error);

      return result;
    }

    for (const args of [['--test', 'test/docs/documentation-examples.test.js'], ['scripts/test-readme-types.js']]) {
      const result = run(args);

      assert.equal(result.status, 0, result.stdout + result.stderr);
    }

    function changeFirstJavaScriptResult(markdown, value) {
      const changed = markdown.replace(/```javascript\r?\n[\s\S]*?```/, (example) =>
        example.replace(/(\/\/ => )[^\r\n]+/, '$1' + JSON.stringify(value))
      );

      assert.notEqual(changed, markdown, 'The fixture must change a JavaScript result.');

      return changed;
    }

    const changedReadme = changeFirstJavaScriptResult(original, 'wrong installed value');

    fs.writeFileSync(filename, changedReadme);
    const javascript = run(['--test', 'test/docs/documentation-examples.test.js']);

    assert.notEqual(javascript.status, 0, 'Changed installed JavaScript output must fail.');
    assert.match(javascript.stdout + javascript.stderr, /wrong installed value/);

    fs.writeFileSync(filename, original);
    const apiFilename = path.join(installed, 'docs/API.md');
    const apiJavascriptOriginal = fs.readFileSync(apiFilename, 'utf8');

    fs.writeFileSync(apiFilename, changeFirstJavaScriptResult(apiJavascriptOriginal, 'wrong installed API value'));
    const apiJavascript = run(['--test', 'test/docs/documentation-examples.test.js']);

    assert.notEqual(apiJavascript.status, 0, 'Changed installed API JavaScript output must fail.');
    assert.match(apiJavascript.stdout + apiJavascript.stderr, /wrong installed API value/);

    fs.writeFileSync(apiFilename, apiJavascriptOriginal);
    const apiOriginal = fs.readFileSync(apiFilename, 'utf8');

    fs.writeFileSync(
      apiFilename,
      apiOriginal.replace(
        /console\.log\(code\);(\s*\/\/ => )"draft"/,
        'console.log(code);$1"wrong installed TypeScript value"'
      )
    );
    const typescript = run(['scripts/test-readme-types.js']);

    assert.notEqual(typescript.status, 0, 'Changed installed TypeScript output must fail.');
    assert.match(typescript.stdout + typescript.stderr, /wrong installed TypeScript value/);
  } finally {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));

    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('API summary rejects broken links, duplicate forms, missing returns and invalid parameter tables', () => {
  const { summaryReferences, contents } = require('../../scripts/documentation-schema');
  const valid =
    '# Sample\n## Contents\n{{TOC}}\n## API summary\n' +
    '| API | Description | Returns |\n| --- | --- | --- |\n| [`sample(value)`](#samplevalue) | Read a value. | `unknown` |\n' +
    '## Methods\n\n### `sample(value)`\nReturns its input.\n\n| Parameter | Type | Description |\n| --- | --- | --- |\n| `value` | `unknown` | Input. |\n';

  assert.equal(summaryReferences(valid).entries.size, 1);
  assert.throws(() => summaryReferences(valid.replace('[`sample(value)`]', '[`sample.value]')), /linked call form/);
  assert.throws(
    () => summaryReferences(valid.replace('[`sample(value)`]', '[`sample.value`]')),
    /Non-callable API rows/
  );
  assert.equal(contents(valid), '- [API summary](#api-summary)\n- [Methods](#methods)');
  assert.throws(() => summaryReferences(valid.replace('(#samplevalue)', '(#missing)')), /Missing API detail target/);
  assert.throws(() => summaryReferences(valid.replace('| `unknown` |\n', '| |\n')), /return type/);

  const row = '| [`sample(value)`](#samplevalue) | Read a value. | `unknown` |\n';

  assert.throws(() => summaryReferences(valid.replace(row, row + row)), /Duplicate public API/);
  assert.throws(
    () => summaryReferences(valid.replace('| API | Description | Returns |', '| API | Returns | Description |')),
    /API summary columns/
  );
  assert.throws(
    () =>
      summaryReferences(
        valid
          .replace('| Parameter | Type | Description |', '| Parameter | Type | Default | Description |')
          .replace('| `value` | `unknown` | Input. |', '| `value` | `unknown` | — | Input. |')
      ),
    /omit Default/
  );
});

test('API summaries omit Returns only for tables of properties or constants', () => {
  const { summaryReferences } = require('../../scripts/documentation-schema');
  const properties =
    '# Sample\n## API summary\n' +
    '| API | Description |\n| --- | --- |\n| [`sample.value`](#samplevalue) | Stored value. |\n' +
    '## Property reference\n\n### `sample.value`\nThe stored value is read-only.\n';

  assert.deepEqual([...summaryReferences(properties).entries.keys()], ['sample.value']);
  assert.throws(
    () => summaryReferences(properties.replace('`sample.value`', '`sample()`')),
    /callable API rows require a Returns column/i
  );
  assert.throws(() => summaryReferences(properties.replace('Stored value. |', 'Stored value. | — |')), /row width/);
});

test('split documents reuse the complete inventory and validate cross-document fragments', () => {
  const root = path.resolve(__dirname, '../..');
  const templates = Object.fromEntries(
    ['README', 'API'].map((name) => [
      name,
      fs.readFileSync(path.join(__dirname, '../../scripts', name + '.template.md'), 'utf8')
    ])
  );
  const documents = require('../../scripts/docs').renderDocuments(
    templates,
    require('../../package.json'),
    require('../../index.js')
  );
  const { summaryReferences, headingsIn } = require('../../scripts/documentation-schema');
  const { validateLinks } = require('../../scripts/documentation-documents');
  const entries = summaryReferences(documents['docs/API.md']).entries;
  const linked = [...documents['README.md'].matchAll(/^\| \[`([^`]+)`\]\(docs\/API\.md#([^)]+)\)/gm)];

  assert.deepEqual(linked.map((match) => match[1]).sort(), [...entries.keys()].sort());

  const toc = documents['README.md'].split('## Contents\n')[1].split('\n## ')[0];

  for (const [, target] of toc.matchAll(/\]\(([^)]+)\)/g))
    assert.ok(target.startsWith('#'), 'Contents links stay on the README page');

  assert.ok(documents['README.md'].includes('**[View full API documentation](docs/API.md)**'));
  assert.ok(!headingsIn(documents['README.md']).headings.some((h) => h.title === 'API reference'));

  validateLinks(documents, root);
  const broken = {
    ...documents,
    'README.md': documents['README.md'].replace(/\(docs\/API\.md#[^)]+\)/, '(docs/API.md#missing)')
  };

  assert.throws(() => validateLinks(broken, root), /missing fragment/);

  const missing = { ...documents, 'README.md': documents['README.md'].replace('(docs/API.md)', '(docs/missing.md)') };

  assert.throws(() => validateLinks(missing, root), /missing document/);
});

test('enum member access links to the detailed member list entry', () => {
  const api = fs.readFileSync(path.join(__dirname, '../../docs/API.md'), 'utf8');
  const entry = api.split('### `MyEnum[key]`')[1].split('### `MyEnum.members`')[0];

  assert.ok(entry.includes('[`MyEnum.members`](#myenummembers)'));
});

test('defineType keeps its former anchor alongside its primary heading', () => {
  const api = fs.readFileSync(path.join(__dirname, '../../docs/API.md'), 'utf8').replace(/\r\n/g, '\n');
  const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf8');
  const { validateLinks } = require('../../scripts/documentation-documents');
  const legacyAnchor = '<a name="constantdefinetypename-fields-options"></a>';
  const documents = {
    'README.md': readme + '\n[Record factory](docs/API.md#constantdefinetypename-fields-options)\n',
    'docs/API.md': api
  };

  assert.ok(api.includes(legacyAnchor + '\n\n### `defineType(name?, fields?, options?)`'));
  validateLinks(documents);

  documents['docs/API.md'] = api.replace(legacyAnchor, '```html\n' + legacyAnchor + '\n```');
  assert.throws(() => validateLinks(documents), /missing fragment/);
});
