'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { consumerEngines } = require('./package-layout');

const { headingsIn, summaryReferences, contents } = require('./documentation-schema');
const referenceSections = [
  {
    title: 'Constant(value?, name?)',
    members: ['Constant', 'new Constant', 'Constant.Constant'],
    forms: ['Constant(value?, name?)', 'new Constant(value?, name?)']
  },
  {
    title: 'defineType(name?, fields?, options?)',
    members: ['Constant.defineType'],
    forms: ['defineType(name?, fields?, options?)']
  },
  { title: 'MyType(...args)', members: ['Type', 'new Type'], forms: ['MyType(...args)', 'new MyType(...args)'] },
  {
    title: 'defineEnum(definitions, name?)',
    members: ['Constant.defineEnum'],
    forms: ['defineEnum(definitions, name?)']
  },
  { title: 'MyEnum.fromValue(input)', members: ['Enum.fromValue'], forms: ['MyEnum.fromValue(input)'] },
  { title: 'MyEnum.hasValue(input)', members: ['Enum.hasValue'], forms: ['MyEnum.hasValue(input)'] },
  { title: 'MyEnum.members', members: ['Enum.members'], forms: ['MyEnum.members'] },
  { title: 'MyEnum.name', members: ['Enum.name'], forms: ['MyEnum.name'] },
  { title: 'MyEnum[key]', members: ['Enum.MEMBER'], forms: ['MyEnum[key]'] },
  { title: 'myMember.value', members: ['member.value'], forms: ['myMember.value'] },
  { title: 'MyType.getInstances()', members: ['Type.getInstances'], forms: ['MyType.getInstances()'] },
  {
    title: 'instance.valueOf()',
    members: ['Constant.prototype.valueOf', 'Type.prototype.valueOf'],
    forms: ['instance.valueOf()']
  },
  { title: 'instance.value', members: [], forms: ['instance.value'] },
  { title: 'instance.name', members: [], forms: ['instance.name'] },
  { title: 'Constant.name', members: [], forms: ['Constant.name', 'MyType.name'] },
  { title: 'Constant.prototype', members: [], forms: ['Constant.prototype', 'MyType.prototype'] },
  { title: 'Constant.defineType', members: [], forms: ['Constant.defineType'] }
];

function publicMembers(api) {
  assert.equal(typeof api, 'function', 'Constant must be callable.');
  assert.equal(typeof api.defineType, 'function', 'Constant.defineType must be callable.');
  assert.equal(typeof api.defineEnum, 'function', 'Constant.defineEnum must be callable.');
  const Type = api.defineType('Documentation', ['value'], { trackInstances: true, valueOf: 'value' });

  assert.equal(typeof Type, 'function', 'Generated types must be callable.');
  assert.ok(new api() instanceof api, 'Constant must support construction with new.');
  assert.ok(new Type() instanceof Type, 'Generated types must support construction with new.');
  const members = ['Constant', 'new Constant', 'Type', 'new Type'];
  const Enum = api.defineEnum({ MEMBER: 'member' });

  for (const key of Reflect.ownKeys(Enum)) members.push('Enum.' + String(key));
  for (const key of Reflect.ownKeys(Enum.MEMBER)) members.push('member.' + String(key));
  const intrinsic = new Set(['length', 'name', 'arguments', 'caller', 'prototype']);

  for (const [name, constructor] of [
    ['Constant', api],
    ['Type', Type]
  ]) {
    for (const key of Reflect.ownKeys(constructor)) {
      if (!intrinsic.has(key)) members.push(name + '.' + String(key));
    }

    for (const key of Reflect.ownKeys(constructor.prototype)) {
      if (key !== 'constructor') members.push(name + '.prototype.' + String(key));
    }
  }

  return members;
}

function documentationCoverage(template, api) {
  const members = publicMembers(api);
  const expected = referenceSections.flatMap((section) => section.members);

  assert.deepEqual(
    [...members].sort(),
    [...expected].sort(),
    'Public API inventory changed; map every member to its reference section.'
  );
  const { entries } = summaryReferences(template);
  const missing = [];
  let covered = 0;

  for (const section of referenceSections) {
    const absent = section.forms.filter((form) => !entries.has(form));

    if (absent.length) {
      missing.push(...absent);
      continue;
    }

    for (const form of section.forms) {
      assert.equal(
        entries.get(form).target.title,
        '`' + section.title + '`',
        'Missing API reference signature: ' + section.title
      );
    }

    covered += section.members.length;
  }

  for (const form of entries.keys())
    assert.ok(
      referenceSections.some((section) => section.forms.includes(form)),
      'Unmapped public API reference: ' + form
    );

  return { covered, total: members.length, percent: (covered * 100) / members.length, missing };
}

function render(template, pkg, api, reference = template) {
  const text = template.replace(/\r\n/g, '\n');

  headingsIn(text);
  const coverage = api && documentationCoverage(reference, api);

  if (coverage)
    assert.equal(coverage.missing.length, 0, 'Missing API reference sections: ' + coverage.missing.join(', '));
  const values = {
    VERSION: pkg.version,
    LICENSE: pkg.license,
    NAME: pkg.name,
    TYPESCRIPT: pkg.devDependencies?.typescript,
    NODE_MIN_VERSION: /^>=(\d+(?:\.\d+){0,2})$/
      .exec(consumerEngines.node)?.[1]
      .split('.')
      .concat(['0', '0'])
      .slice(0, 3)
      .join('.'),
    TOC: contents(text, [
      'Protected fields, mutable references',
      'Safe instance snapshots',
      'Validation and normalisation'
    ]),
    DOCS_COVERAGE: coverage && String(Number(coverage.percent.toFixed(2))),
    DOCS_COLOUR: coverage && (coverage.percent === 100 ? 'brightgreen' : 'yellow')
  };

  return text.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key) || typeof values[key] !== 'string')
      throw Error('Unknown documentation token: ' + token);

    return values[key];
  });
}

function renderDocuments(templates, pkg, api) {
  return require('./documentation-documents').renderDocuments(templates, pkg, api, render);
}

function generate({ root = path.resolve(__dirname, '..'), check = false, api = require('../index.js') } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const templates = Object.fromEntries(
    ['README', 'API'].map((name) => [name, fs.readFileSync(path.join(root, 'scripts', name + '.template.md'), 'utf8')])
  );
  const documents = renderDocuments(templates, pkg, api);

  require('./documentation-documents').validateLinks(documents, root);
  for (const [name, output] of Object.entries(documents)) {
    const target = path.join(root, name);

    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output)
        throw Error(name + ' is stale. Run npm run docs.');
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output);
    }
  }

  return documents;
}

module.exports = { render, generate, renderDocuments, documentationCoverage };
if (require.main === module) {
  if (process.argv.slice(2).some((arg) => arg !== '--check') || process.argv.length > 3)
    throw Error('Usage: node scripts/docs.js [--check]');
  generate({ check: process.argv.includes('--check') });
  console.log(
    process.argv.includes('--check')
      ? 'README and API metadata and public references are current.'
      : 'Generated README.md and docs/API.md with a shared API summary.'
  );
}
