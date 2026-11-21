'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');

function resolveLibrary(location) {
  const input = path.resolve(location);
  const isDirectory = fs.statSync(input).isDirectory();
  // Resolving from inside the directory prevents a neighbouring .js or .json file from winning.
  const entry = isDirectory ? createRequire(path.join(input, 'package.json')).resolve('./') : require.resolve(input);
  const sourceDirectory = isDirectory ? input : path.dirname(entry);
  const manifest = path.join(sourceDirectory, 'package.json');
  let version = null;

  // An enclosing repository's metadata may describe a different implementation.
  if (fs.existsSync(manifest)) {
    const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8').replace(/^\uFEFF/, ''));

    version = metadata.version ?? null;
  }

  return { input, entry, sourceDirectory, version };
}

function loadLibrary(location) {
  const library = resolveLibrary(location);

  return { ...library, api: require(library.entry) };
}

function hashSources(library) {
  const files = new Set();

  function visit(module) {
    if (!module || files.has(module.filename)) {
      return;
    }

    files.add(module.filename);
    for (const child of module.children) visit(child);
  }

  visit(require.cache[library.entry]);

  return Object.fromEntries(
    [...files]
      .sort()
      .map((filename) => [
        path.relative(library.sourceDirectory, filename).split(path.sep).join('/'),
        createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
      ])
  );
}

module.exports = { resolveLibrary, loadLibrary, hashSources };
