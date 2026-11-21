'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readCandidate } = require('./package-file');
const { name, version } = require('../package.json');

const archive = path.join('artifacts', name + '-' + version + '.tgz');
const expected = process.argv[2];
const candidate = readCandidate(archive, { requireSidecar: true });

if (expected !== undefined) {
  assert.match(expected, /^[a-f0-9]{64}$/, 'Expected the producer SHA-256 digest');
  assert.equal(candidate.sha256, expected, 'Candidate does not match the producer SHA-256 digest');
}

fs.appendFileSync(process.env.GITHUB_OUTPUT, 'archive=' + candidate.tarball + '\nsha256=' + candidate.sha256 + '\n');
