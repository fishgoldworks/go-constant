'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function validateArchive(bytes, filename, metadata, report) {
  let tar;

  try {
    tar = zlib.gunzipSync(bytes);
  } catch (error) {
    throw new Error('Packed archive is not valid gzip: ' + filename, { cause: error });
  }

  function invalid(reason) {
    throw new Error('Packed archive is not a valid npm tarball: ' + reason);
  }

  function octal(header, offset, length) {
    const text = header
      .subarray(offset, offset + length)
      .toString('ascii')
      .replace(/\0.*$/, '')
      .trim();

    if (!/^[0-7]+$/.test(text)) invalid('invalid numeric header');
    const value = Number.parseInt(text, 8);

    if (!Number.isSafeInteger(value)) invalid('oversized entry');

    return value;
  }

  if (tar.length < 1024 || tar.length % 512 !== 0) invalid('incomplete blocks');
  const files = new Set();
  let manifest;
  let ended = false;

  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);

    if (header.every((byte) => byte === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every((byte) => byte === 0))
        invalid('invalid end blocks');
      ended = true;
      break;
    }

    let checksum = 0;

    for (let index = 0; index < 512; index++) {
      checksum += index >= 148 && index < 156 ? 32 : header[index];
    }

    if (checksum !== octal(header, 148, 8)) invalid('header checksum mismatch');
    const size = octal(header, 124, 12);
    const data = offset + 512;
    const next = data + Math.ceil(size / 512) * 512;

    if (next > tar.length) invalid('truncated entry');
    const text = (start, length) =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/, '');
    const prefix = text(345, 155);
    const name = (prefix ? prefix + '/' : '') + text(0, 100);
    const directory = header[156] === 53;
    const canonical = directory ? name.replace(/\/$/, '') : name;

    if (
      (!directory && header[156] !== 0 && header[156] !== 48) ||
      (!canonical.startsWith('package/') && canonical !== 'package')
    )
      invalid('unsupported entry: ' + name);
    if (canonical.includes('\\') || canonical.split('/').some((part) => !part || part === '.' || part === '..'))
      invalid('invalid path: ' + name);
    if (!directory) {
      const relative = canonical.slice('package/'.length);

      if (!relative || files.has(relative)) invalid('duplicate or empty file path');
      files.add(relative);
      if (relative === 'package.json') {
        manifest = JSON.parse(tar.subarray(data, data + size).toString('utf8'));
      }
    }

    offset = next;
  }

  if (!ended) invalid('missing end blocks');
  if (!manifest || manifest.name !== metadata.name || manifest.version !== metadata.version)
    invalid('package identity mismatch');

  if (report) {
    const expected = report.files.map((entry) => entry.path);

    if (
      expected.some((name) => typeof name !== 'string') ||
      new Set(expected).size !== expected.length ||
      JSON.stringify([...files].sort()) !== JSON.stringify([...expected].sort())
    )
      invalid('inventory differs from npm report');
  }
}

function physicalPath(filename) {
  let current = path.resolve(filename);
  const suffix = [];

  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...suffix);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const entry = fs.lstatSync(current, { throwIfNoEntry: false });

      if (entry && entry.isSymbolicLink()) {
        throw new Error('Cannot resolve filesystem alias: ' + current, { cause: error });
      }

      const parent = path.dirname(current);

      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

function assertOutsidePackage(filename, packageRoot) {
  function within(parent, child) {
    const relative = path.relative(parent, child);

    return !relative || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
  }

  const absolute = path.resolve(filename);

  if (within(path.resolve(packageRoot), absolute) || within(physicalPath(packageRoot), physicalPath(absolute))) {
    throw new Error('Release candidates must stay outside generated package/: ' + absolute);
  }
}

function readCandidate(filename, { metadata = require('../package.json'), report, requireSidecar = false } = {}) {
  if (!filename) throw new Error('Supply --tarball <file> created by npm run pack:package; this check never packs.');
  const tarball = path.resolve(filename);

  if (!fs.existsSync(tarball) || !fs.statSync(tarball).isFile()) {
    throw new Error('Release tarball is missing: ' + tarball);
  }

  const bytes = fs.readFileSync(tarball);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const sidecar = tarball + '.sha256';
  const hasSidecar = fs.existsSync(sidecar);

  if (requireSidecar && !hasSidecar) {
    throw new Error('Release tarball checksum sidecar is missing: ' + sidecar);
  }

  if (hasSidecar) {
    const expected = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];

    if (expected !== sha256) throw new Error('Release tarball SHA-256 mismatch: ' + tarball);
  }

  validateArchive(bytes, tarball, metadata, report);

  return { tarball, sha256 };
}

function options(args, allowed) {
  const result = {};

  for (let i = 0; i < args.length; i++) {
    const name = args[i].replace(/^--/, '');

    if (
      !args[i].startsWith('--') ||
      !allowed.includes(name) ||
      result[name] !== undefined ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new Error('Expected ' + allowed.map((key) => '--' + key + ' <value>').join(' or '));
    }

    result[name] = args[++i];
  }

  return result;
}

module.exports = { readCandidate, options, assertOutsidePackage };
