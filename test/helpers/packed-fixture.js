'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let archiveFixture;

function packedFixture() {
  if (archiveFixture) {
    return archiveFixture;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-constant-packed-data-'));

  try {
    const source = path.join(directory, 'source');

    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: 'go-constant', version: '2.0.0', files: ['index.js'] })
    );
    fs.writeFileSync(path.join(source, 'index.js'), "module.exports = 'fresh packed marker';\n");
    const result = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        'pack',
        source,
        '--ignore-scripts',
        '--dry-run=false',
        '--offline',
        '--json',
        '--pack-destination',
        directory
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: path.join(directory, 'cache') }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const [report] = JSON.parse(result.stdout);

    archiveFixture = { report, bytes: fs.readFileSync(path.join(directory, report.filename)) };

    return archiveFixture;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = packedFixture;
