'use strict';

const { readdirSync } = require('node:fs');
const path = require('node:path');

module.exports = function assertCoverageInventory(root, report) {
  const start = report.lastIndexOf('# start of coverage report');
  const end = start < 0 ? -1 : report.indexOf('# end of coverage report', start);

  if (start < 0 || end < 0) {
    throw new Error('Missing or malformed coverage report');
  }

  // Reconstruct paths from the indented TAP coverage table, as in go-defaults.
  const covered = new Set();
  const directories = [];

  for (const line of report.slice(start, end).split(/\r?\n/)) {
    const match = /^#( +)([^|]+?)\s+\|/.exec(line);

    if (!match) continue;

    const [, spaces, rawName] = match;
    const name = rawName.trim();

    if (name === 'file' || name === 'all files') continue;

    const depth = spaces.length;

    while (directories.length && directories.at(-1).depth >= depth) directories.pop();
    const filename = [...directories.map((directory) => directory.name), name].join('/');

    if (/\.(?:js|cjs|mjs)$/.test(name)) covered.add(filename);
    else directories.push({ depth, name });
  }

  const entries = readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:js|cjs|mjs)$/.test(entry.name)) continue;

    const parts = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep);

    if (parts.slice(0, -1).some((part) => part === 'temp' || part === '.tmp')) continue;

    const source = parts.join('/');

    if (!covered.has(source)) {
      throw new Error('Missing source coverage entry: ' + source);
    }
  }
};
