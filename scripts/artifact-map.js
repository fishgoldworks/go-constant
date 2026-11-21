'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const normalise = (text) => text.replace(/\r\n?/g, '\n');

function checkSourceMap(directory) {
  const source = fs.readFileSync(path.join(directory, 'go-constant.js'), 'utf8');
  const minified = fs.readFileSync(path.join(directory, 'go-constant.min.js'), 'utf8');
  const readable = JSON.parse(fs.readFileSync(path.join(directory, 'go-constant.js.map'), 'utf8'));
  const map = JSON.parse(fs.readFileSync(path.join(directory, 'go-constant.min.js.map'), 'utf8'));
  const bundled = normalise(source).replace(/\/\/# sourceMappingURL=go-constant\.js\.map\s*$/, '');

  assert.match(source, /sourceMappingURL=go-constant\.js\.map/);
  assert.equal(readable.version, 3);
  assert.equal(readable.file, 'go-constant.js');
  assert.deepEqual(readable.sources, ['go-constant.bundle.js']);
  assert.ok(Array.isArray(readable.sourcesContent), 'readable source map must embed sourcesContent');
  assert.deepEqual(
    readable.sourcesContent.map(normalise),
    [bundled],
    'source map content must match the distributed source'
  );
  assert.ok(readable.mappings.length > 0);
  assert.equal(map.version, 3);
  assert.equal(map.file, 'go-constant.min.js');
  assert.deepEqual(map.sources, readable.sources, 'Minified map must compose the build map');
  assert.ok(Array.isArray(map.sourcesContent), 'source map must embed sourcesContent');
  assert.deepEqual(
    map.sourcesContent.map(normalise),
    readable.sourcesContent.map(normalise),
    'source map content must match the distributed source'
  );
  assert.match(minified, /sourceMappingURL=go-constant\.min\.js\.map/);
  assert.ok(map.mappings.length > 0);
  assert.ok(
    Buffer.byteLength(minified) < Buffer.byteLength(source) * 0.75,
    'minified output must be meaningfully smaller'
  );
  for (const code of [source, minified]) {
    assert.match(code, /MIT License/);
    assert.match(code, /Permission is hereby granted, free of charge/);
    assert.match(code, /THE SOFTWARE IS PROVIDED "AS IS"/);
  }
}

module.exports = { checkSourceMap };
