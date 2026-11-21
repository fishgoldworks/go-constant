'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { minify } = require('terser');
const { packageContents, inventory } = require('./package-layout');

// This package has no runtime dependencies.
// An explicit dependency table avoids a full bundler and accidental externals.
const modules = [
  ['index.js', { './src/Constant': 'src/Constant.js' }],
  ['src/Constant.js', { './defineType': 'src/defineType.js', './defineEnum': 'src/defineEnum.js' }],
  ['src/defineType.js', {}],
  ['src/defineEnum.js', {}]
];

async function artifacts(root) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const licence = fs.readFileSync(path.join(root, 'LICENSE.md'), 'utf8').replace(/\r\n?/g, '\n').trim();
  const banner = `/*! go-constant v${version}\n${licence}\n*/`;
  const entries = modules
    .map(([name, dependencies]) => {
      const source = fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n?/g, '\n');

      new vm.Script(source, { filename: name });

      return `${JSON.stringify(name)}: [function (require, module, exports) {\n${source}\n}, ${JSON.stringify(dependencies)}]`;
    })
    .join(',\n');
  let bundle = `${banner}
(function (root, factory) {
    if (typeof module === "object" && module !== null && module.exports) module.exports = factory();
    else if (typeof define === "function" && define.amd) define([], factory);
    else root.goConstant = factory();
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
    "use strict";
    const modules = {
${entries}
    };
    const cache = Object.create(null);
    function load(id) {
        if (cache[id]) return cache[id].exports;
        const entry = modules[id];
        if (!entry) throw new Error("Unknown bundled module: " + id);
        const module = cache[id] = { exports: {} };
        entry[0](function (request) {
            const target = entry[1][request];
            if (!target) throw new Error("Unexpected bundled dependency: " + request);
            return load(target);
        }, module, module.exports);
        return module.exports;
    }
    return load("index.js");
});
`;
  const readableMap = {
    version: 3,
    file: 'go-constant.js',
    names: [],
    sources: ['go-constant.bundle.js'],
    sourcesContent: [bundle],
    mappings: bundle
      .split('\n')
      .map((_, index) => (index ? 'AACA' : 'AAAA'))
      .join(';')
  };

  bundle += '//# sourceMappingURL=go-constant.js.map\n';
  const result = await minify(
    { 'go-constant.js': bundle },
    {
      ecma: 2015,
      compress: { passes: 2 },
      mangle: true,
      format: { comments: /^!/, ascii_only: true },
      sourceMap: {
        content: readableMap,
        filename: 'go-constant.min.js',
        url: 'go-constant.min.js.map',
        includeSources: true
      }
    }
  );

  if (typeof result.code !== 'string' || typeof result.map !== 'string') {
    throw new Error('The minifier did not produce complete bundle and source-map output.');
  }

  new vm.Script(bundle, { filename: 'go-constant.js' });
  new vm.Script(result.code, { filename: 'go-constant.min.js' });

  return {
    'go-constant.js': bundle,
    'go-constant.js.map': JSON.stringify(readableMap) + '\n',
    'go-constant.min.js': result.code + '\n',
    'go-constant.min.js.map': result.map + '\n'
  };
}

// Exercise the staged files before installing them: syntax alone cannot detect
// broken exports, missing bundled dependencies or a loader branch regression.
function smokeTest(directory) {
  for (const name of ['go-constant.js', 'go-constant.min.js']) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8');

    for (const mode of ['commonjs', 'amd', 'global', 'worker', 'null-module']) {
      let exported;
      const sandbox = {};

      if (mode === 'commonjs') sandbox.module = { exports: {} };
      if (mode === 'amd') {
        sandbox.define = (dependencies, factory) => {
          exported = factory();
        };

        sandbox.define.amd = {};
      }

      if (mode === 'worker') {
        sandbox.globalThis = undefined;
        sandbox.self = {};
      }

      if (mode === 'null-module') sandbox.module = null;
      const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

      new vm.Script(source, { filename: name }).runInContext(context, { timeout: 1000 });
      const Constant =
        mode === 'commonjs' ? sandbox.module.exports : mode === 'amd' ? exported : (sandbox.self || sandbox).goConstant;

      assert.equal(typeof Constant, 'function', name + ': ' + mode + ' export');
      assert.equal(Constant.Constant, Constant);
      const value = Constant(42, 'Answer');

      assert.equal(value.valueOf(), 42);
      assert.equal(value.name, 'Answer');
      assert.equal(Constant(value), value);
      assert.equal(Object.getOwnPropertyDescriptor(value, 'value').writable, false);
      const Type = Constant.defineType('Smoke', ['n'], {
        validate(n) {
          return [n * 2];
        },
        valueOf: 'n',
        trackInstances: true
      });
      const item = Type(3);

      assert.equal(item.valueOf(), 6);
      assert.equal(Type.getInstances()[0], item);
      Type.getInstances().length = 0;
      assert.equal(Type.getInstances().length, 1);
      assert.equal('instances' in Type, false);
    }
  }
}

async function build({ root = path.resolve(__dirname, '..'), check = false } = {}) {
  // Documentation is part of the distribution; check mode remains read-only.
  require('./docs').generate({ root, check, api: require(path.join(root, 'index.js')) });
  // Finish and validate the complete consumer package before replacing it. A failed minifier
  // cannot silently reuse a bundle from a previous release.
  const bundles = await artifacts(root);
  const output = packageContents(root);

  for (const [name, content] of Object.entries(bundles)) output['dist/' + name] = Buffer.from(content);
  const destination = path.join(root, 'package');
  const names = Object.keys(output).sort();

  if (check) {
    const existing = fs.existsSync(destination) ? inventory(destination) : [];

    if (JSON.stringify(existing) !== JSON.stringify(names)) {
      throw new Error('package is missing files or contains unexpected files; run npm run build.');
    }

    for (const name of names) {
      if (!fs.readFileSync(path.join(destination, name)).equals(output[name])) {
        throw new Error(name + ' is stale; run npm run build.');
      }
    }

    return;
  }

  const staging = fs.mkdtempSync(path.join(root, '.package-'));
  let backup = null;
  let preserveBackup = false;
  let buildError;
  let buildFailed = false;

  try {
    for (const name of names) {
      fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
      fs.writeFileSync(path.join(staging, name), output[name]);
    }

    smokeTest(path.join(staging, 'dist'));
    const api = require(path.join(staging, 'index.js'));
    const esm = await import(require('node:url').pathToFileURL(path.join(staging, 'index.mjs')).href);

    assert.equal(esm.default, api);
    assert.equal(esm.defineType, api.defineType);
    assert.equal(esm.Constant, api);
    assert.equal(esm.defineEnum, api.defineEnum);
    // Never delete the only complete distribution before installing its
    // replacement. A same-filesystem backup also permits rollback when the
    // final rename fails (for example, because the destination is locked).
    if (fs.existsSync(destination)) {
      backup = fs.mkdtempSync(path.join(root, '.package-backup-'));
      fs.renameSync(destination, path.join(backup, 'package'));
    }

    try {
      fs.renameSync(staging, destination);
    } catch (installError) {
      if (backup !== null) {
        const previous = path.join(backup, 'package');

        try {
          fs.renameSync(previous, destination);
        } catch (restoreError) {
          // Leave a failed rollback recoverable, rather than deleting
          // the previous release in the cleanup below.
          preserveBackup = true;
          // eslint-disable-next-line preserve-caught-error -- AggregateError.errors retains the original and recovery failures.
          throw new AggregateError(
            [installError, restoreError],
            'Build replacement and rollback failed; previous distribution retained at ' + previous
          );
        }
      }

      throw installError;
    }
  } catch (error) {
    buildError = error;
    buildFailed = true;
  }

  {
    const cleanupErrors = [];

    for (const directory of [staging, ...(backup !== null && !preserveBackup ? [backup] : [])]) {
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length) {
      if (buildFailed)
        throw new AggregateError(
          [buildError, ...cleanupErrors],
          (buildError instanceof Error ? buildError.message : String(buildError)) +
            '; cleanup also failed at ' +
            staging
        );
      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      throw new AggregateError(cleanupErrors, 'Build cleanup failed at ' + staging);
    }
  }

  if (buildFailed) throw buildError;
}

module.exports = { build };
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.some((arg) => arg !== '--check') || args.length > 1) {
    console.error('Usage: node scripts/build.js [--check]');
    process.exitCode = 1;
  } else {
    build({ check: args.includes('--check') }).then(
      () =>
        console.log(
          args.includes('--check')
            ? 'Distribution is current.'
            : 'Built the complete consumer package, browser bundles and source map.'
        ),
      (error) => {
        console.error(error);
        process.exitCode = 1;
      }
    );
  }
}
