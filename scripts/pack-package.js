'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build } = require('./build.js');
const { readCandidate, options, assertOutsidePackage } = require('./package-file.js');
const root = path.resolve(__dirname, '..');

async function packPackage(destination = path.join(root, 'artifacts')) {
  const npm = process.env.npm_execpath;

  if (!npm) throw new Error('Run with npm run pack:package or npm run verify.');
  destination = path.resolve(destination);
  assertOutsidePackage(destination, path.join(root, 'package'));
  await build({ root });
  fs.mkdirSync(destination, { recursive: true });
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const filename = metadata.name.replace(/^@/, '').replace(/\//g, '-') + '-' + metadata.version + '.tgz';
  const tarball = path.join(destination, filename);
  const stage = fs.mkdtempSync(path.join(destination, '.pack-'));
  const output = path.join(stage, 'output');
  const previous = path.join(stage, 'previous');
  const saved = [];
  const installed = [];
  let keepRecovery = false;
  let failed = false;
  let failure;
  let candidate;

  try {
    fs.mkdirSync(output);
    fs.mkdirSync(previous);
    // Require fresh output even when npm dry-run is inherited. Lifecycle hooks
    // belong to verification, not this internal pack of the consumer directory.
    const result = spawnSync(
      process.execPath,
      [
        npm,
        'pack',
        path.join(root, 'package'),
        '--ignore-scripts',
        '--dry-run=false',
        '--json',
        '--pack-destination',
        output
      ],
      { cwd: root, encoding: 'utf8', timeout: 60000 }
    );

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('npm pack failed:\n' + result.stdout + result.stderr);
    const reports = JSON.parse(result.stdout);

    if (
      !Array.isArray(reports) ||
      reports.length !== 1 ||
      reports[0]?.filename !== filename ||
      !Array.isArray(reports[0].files) ||
      reports[0].files.length === 0
    ) {
      throw new Error('npm pack must report exactly one fresh archive: ' + filename);
    }

    const packed = path.join(output, filename);

    if (!fs.lstatSync(packed).isFile()) throw new Error('Packed archive must be a regular file: ' + packed);
    const { sha256 } = readCandidate(packed, { metadata, report: reports[0] });

    fs.writeFileSync(packed + '.sha256', sha256 + '  ' + filename + '\n');
    // The archive/checksum pair cannot be replaced atomically. Keep both prior
    // files until installation succeeds, and restore them on ordinary failure.
    for (const name of [filename, filename + '.sha256']) {
      const target = path.join(destination, name);
      const stat = fs.lstatSync(target, { throwIfNoEntry: false });

      if (stat) {
        if (!stat.isFile()) throw new Error('Candidate target must be a regular file: ' + target);
        fs.renameSync(target, path.join(previous, name));
        saved.push(name);
      }
    }

    for (const name of [filename, filename + '.sha256']) {
      fs.renameSync(path.join(output, name), path.join(destination, name));
      installed.push(name);
    }

    candidate = readCandidate(tarball, { metadata, requireSidecar: true });
  } catch (error) {
    failed = true;
    failure = error;
    const recoveryErrors = [];

    for (const name of installed.reverse()) {
      try {
        fs.unlinkSync(path.join(destination, name));
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }

    for (const name of saved.reverse()) {
      try {
        fs.renameSync(path.join(previous, name), path.join(destination, name));
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }

    if (recoveryErrors.length) {
      keepRecovery = true;
      failure = new AggregateError(
        [error, ...recoveryErrors],
        'Candidate rollback failed; recovery files retained at ' + stage
      );
      failure.recoveryDirectory = stage;
    }
  }

  if (!keepRecovery) {
    try {
      fs.rmSync(stage, { recursive: true, force: true });
    } catch (cleanupError) {
      if (failed) {
        failure = new AggregateError([failure, cleanupError], 'Packing and staging cleanup failed at ' + stage);
      } else {
        failure = new Error('Candidate installed at ' + tarball + '; staging cleanup failed at ' + stage, {
          cause: cleanupError
        });
        failure.committed = true;
        failure.tarball = tarball;
      }

      failed = true;
    }
  }

  if (failed) throw failure;

  console.log('Release candidate: ' + candidate.tarball + '\nSHA-256: ' + candidate.sha256);

  return candidate;
}

module.exports = { packPackage };
if (require.main === module) {
  Promise.resolve()
    .then(() => packPackage(options(process.argv.slice(2), ['destination']).destination))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
