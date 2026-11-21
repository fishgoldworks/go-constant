'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'package');
const consumerEngines = { node: '>=8' };
const focusedFunctions = {
  Constant: 'export = Constant;',
  defineType: 'declare const defineType: typeof Constant.defineType;\nexport = defineType;',
  defineEnum: null
};
const authoredFiles = [
  'index.js',
  'index.mjs',
  'index.d.ts',
  'index.d.mts',
  'defineEnum.d.ts',
  ...Object.keys(focusedFunctions).map((name) => 'src/' + name + '.js'),
  'README.md',
  'docs/API.md',
  'CHANGELOG.md',
  'docs/migration.md',
  'LICENSE.md'
];
const bundleFiles = ['go-constant.js', 'go-constant.js.map', 'go-constant.min.js', 'go-constant.min.js.map'];
const consumerFiles = [
  ...authoredFiles,
  ...bundleFiles.map((file) => 'dist/' + file),
  ...Object.entries(focusedFunctions).flatMap(([name, declaration]) => [
    name + '.js',
    name + '.mjs',
    name + '.d.mts',
    ...(declaration ? [name + '.d.ts'] : [])
  ])
];

function consumerManifest(sourceRoot = root) {
  const metadata = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  const manifest = {};

  for (const field of [
    'name',
    'version',
    'description',
    'license',
    'author',
    'contributors',
    'email',
    'keywords',
    'homepage',
    'repository',
    'bugs',
    'funding',
    'type'
  ]) {
    if (metadata[field] !== undefined) manifest[field] = metadata[field];
  }

  Object.assign(manifest, {
    engines: consumerEngines,
    main: 'index.js',
    module: 'index.mjs',
    types: 'index.d.ts'
  });
  const conditions = {
    import: { types: './index.d.mts', default: './index.mjs' },
    require: { types: './index.d.ts', default: './index.js' }
  };

  conditions.default = './index.js';
  const exports = { '.': [conditions, './index.js'] };

  for (const name of Object.keys(focusedFunctions)) {
    const commonjs = './' + name + '.js';

    exports['./' + name] = [
      {
        import: { types: './' + name + '.d.mts', default: './' + name + '.mjs' },
        require: { types: './' + name + '.d.ts', default: commonjs },
        default: commonjs
      },
      commonjs
    ];
  }

  exports['./package.json'] = './package.json';
  for (const file of bundleFiles) exports['./dist/' + file] = './dist/' + file;
  exports['./dist/*'] = './dist/*';
  manifest.exports = exports;

  manifest.unpkg = './dist/go-constant.min.js';
  manifest.jsdelivr = './dist/go-constant.min.js';
  manifest.files = consumerFiles;
  manifest.sideEffects = ['./dist/*.js'];
  for (const field of [
    'publishConfig',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'os',
    'cpu'
  ]) {
    if (metadata[field] !== undefined) manifest[field] = metadata[field];
  }

  return manifest;
}

function packageContents(sourceRoot = root) {
  const output = Object.fromEntries(authoredFiles.map((file) => [file, fs.readFileSync(path.join(sourceRoot, file))]));

  for (const [name, declaration] of Object.entries(focusedFunctions)) {
    output[name + '.js'] = Buffer.from("'use strict';\nmodule.exports = require('./src/" + name + ".js');\n");
    const esm = `import ${name} from './${name}.js';\nexport { ${name}, ${name} as default };\n`;

    output[name + '.mjs'] = Buffer.from(esm);
    output[name + '.d.mts'] = Buffer.from(esm);
    if (declaration)
      output[name + '.d.ts'] = Buffer.from("import Constant = require('./index.js');\n" + declaration + '\n');
  }

  output['package.json'] = Buffer.from(JSON.stringify(consumerManifest(sourceRoot), null, 2) + '\n');

  return output;
}

function inventory(directory, prefix = '') {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix + entry.name;

      if (entry.isSymbolicLink()) throw new Error('Generated packages must not contain symlinks: ' + relative);

      return entry.isDirectory() ? inventory(path.join(directory, entry.name), relative + '/') : [relative];
    })
    .sort();
}

module.exports = {
  consumerEngines,
  root,
  packageRoot,
  authoredFiles,
  bundleFiles,
  consumerFiles,
  consumerManifest,
  packageContents,
  inventory
};
