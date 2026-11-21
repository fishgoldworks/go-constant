'use strict';

const assert = require('node:assert/strict');
const ts = require('typescript');

function tokens(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const result = [];
  const templateBraces = [];

  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.TemplateHead) templateBraces.push(0);
    else if (kind === ts.SyntaxKind.OpenBraceToken && templateBraces.length)
      templateBraces[templateBraces.length - 1]++;
    else if (kind === ts.SyntaxKind.CloseBraceToken && templateBraces.length) {
      if (templateBraces[templateBraces.length - 1] === 0) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === ts.SyntaxKind.TemplateTail) templateBraces.pop();
      } else templateBraces[templateBraces.length - 1]--;
    }

    result.push({
      key: kind + ':' + (kind === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText()),
      start: scanner.getTokenPos(),
      end: scanner.getTextPos()
    });
  }

  return result;
}

// Match semantic tokens so quote style and indentation cannot disable a fault injection.
module.exports = function replaceMutation(source, before, after, name, unique = true) {
  const input = tokens(source);
  const target = tokens(before);

  assert.ok(target.length, 'Empty mutation target: ' + name);
  const matches = [];

  for (let index = 0; index <= input.length - target.length; index++) {
    if (target.every((token, offset) => token.key === input[index + offset].key)) matches.push(index);
  }

  if (unique === true) assert.equal(matches.length, 1, 'Mutation ' + name + ' requires one exact token target');
  else assert.ok(matches.length, 'Mutation no longer matches the implementation: ' + name);
  if (unique === 'all') {
    for (const index of matches.reverse())
      source = source.slice(0, input[index].start) + after + source.slice(input[index + target.length - 1].end);

    return source;
  }

  const index = matches[0];

  return source.slice(0, input[index].start) + after + source.slice(input[index + target.length - 1].end);
};
