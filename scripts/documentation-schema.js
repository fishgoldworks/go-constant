'use strict';

const assert = require('node:assert/strict');

function headingsIn(text) {
  let fence;
  const counts = new Map();
  const headings = [];
  const anchors = new Set();
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);

    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
        fence = undefined;
      continue;
    }

    if (marker) {
      fence = marker[1];
      continue;
    }

    const customAnchor = /^ {0,3}<a name="([a-z0-9_-]+)"><\/a> *$/i.exec(line);

    if (customAnchor) anchors.add(customAnchor[1]);

    const match = /^(#{1,6}) (.+)$/.exec(line);

    if (!match) continue;
    const title = match[2];
    const slug = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) || 0;

    counts.set(slug, count + 1);
    const anchor = slug + (count ? '-' + count : '');

    headings.push({ title, level: match[1].length, index, anchor });
    anchors.add(anchor);
  }

  return { headings, lines, anchors };
}

function summaryReferences(text) {
  const { headings, lines } = headingsIn(text);
  const summary = headings.find((h) => h.level === 2 && h.title === 'API summary');

  assert.ok(summary, 'Missing API summary');
  const end = headings.find(
    (h) => h.index > summary.index && h.level === 2 && ['Behaviour', 'TypeScript', 'Performance'].includes(h.title)
  );
  const details = headings.filter((h) => h.index > summary.index && (!end || h.index < end.index));
  const titles = new Set();

  for (const heading of details) {
    assert.ok(!titles.has(heading.title), 'Duplicate API reference section: ' + heading.title);
    titles.add(heading.title);
  }

  const after = details.find((h) => h.level === 2);
  const rows = lines.slice(summary.index + 1, after ? after.index : end?.index);
  const entries = new Map();

  for (let i = summary.index + 1; i < (end ? end.index : lines.length); i++) {
    if (!lines[i].startsWith('| Parameter |')) continue;
    const columns = lines[i]
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim());
    const hasDefault = columns.includes('Default');

    assert.deepEqual(
      columns,
      hasDefault ? ['Parameter', 'Type', 'Default', 'Description'] : ['Parameter', 'Type', 'Description'],
      'Parameter table columns'
    );
    const defaults = [];

    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
      const cells = lines[j]
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());

      assert.equal(cells.length, columns.length, 'Parameter table row width');
      assert.ok(cells.every(Boolean), 'Parameter table cells must be populated');
      if (hasDefault) defaults.push(cells[2]);
    }

    if (hasDefault)
      assert.ok(
        defaults.some((value) => value !== '—'),
        'Required-only parameter tables omit Default'
      );
  }

  let fence;
  let columnCount;

  for (const line of rows) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);

    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
        fence = undefined;
      continue;
    }

    if (marker) {
      fence = marker[1];
      columnCount = undefined;
      continue;
    }

    if (!line.startsWith('|')) {
      columnCount = undefined;
      continue;
    }

    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells[0] === 'API') {
      const columns = cells.length === 2 ? ['API', 'Description'] : ['API', 'Description', 'Returns'];

      assert.deepEqual(cells, columns, 'API summary columns');
      columnCount = columns.length;
      continue;
    }

    assert.equal(cells.length, columnCount, 'API summary row width must match its header');
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;

    assert.ok(cells[1], 'API summary description is required');
    const link = /^\[`([^`]+)`\]\(#([^)]+)\)$/.exec(cells[0]);

    assert.ok(link, 'Every API summary row needs one linked call form: ' + cells[0]);
    const [, signature, anchor] = link;

    if (signature.includes('(')) {
      assert.equal(columnCount, 3, 'Callable API rows require a Returns column');
      assert.ok(cells[2], 'API summary return type is required');
    } else if (columnCount === 3) {
      assert.equal(cells[2], '—', 'Non-callable API rows use — in Returns; describe the value in Description');
    }

    assert.ok(!entries.has(signature), 'Duplicate public API reference: ' + signature);
    const target = details.find((h) => h.anchor === anchor);

    assert.ok(
      target && target.level === 3 && /^`[^`]+`$/.test(target.title) && target.index > (after?.index ?? summary.index),
      'Missing API detail target: ' + anchor
    );
    const next = headings.find((h) => h.index > target.index && h.level <= target.level);
    const body = lines
      .slice(target.index + 1, next ? next.index : lines.length)
      .join('\n')
      .replace(/<!--[^]*?-->/g, '')
      .replace(/(`{3,}|~{3,})[^]*?\1/g, '')
      .trim();

    assert.ok(/[A-Za-z]/.test(body), 'API detail has no explanatory text: ' + anchor);
    entries.set(signature, { anchor, target });
  }

  return { entries, headings };
}

function contents(text, selected = []) {
  return headingsIn(text)
    .headings.filter((h) => (h.level === 2 && h.title !== 'Contents') || (h.level === 3 && selected.includes(h.title)))
    .map((h) => (h.level === 3 ? '  ' : '') + `- [${h.title}](#${h.anchor})`)
    .join('\n');
}

module.exports = { headingsIn, summaryReferences, contents };
