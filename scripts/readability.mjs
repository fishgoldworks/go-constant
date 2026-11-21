import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';

// An upstream gap after a trailing next-line directive changes its target.
// Move only that whitespace gap before the whole trailing comment chain.
// Counted coverage spans must keep their physical lines; unsafe fixes stay
// reported for explicit author reconciliation rather than changing coverage.
function preserveDirectiveTargets(rule) {
  return {
    ...rule,
    create(context) {
      const source = context.sourceCode;
      const coverageSpans = source.getAllComments().flatMap((comment) => {
        const match = /^\s*(?:node:coverage|c8|v8)\s+ignore\s+next(?:\s+(\d+))?\b/u.exec(comment.value);

        if (!match) {
          return [];
        }

        const count = match[1] === undefined ? 1 : Number(match[1]);

        return [{ end: comment.range[1], lastLine: comment.loc.end.line + count }];
      });
      const changesCoverageSpan = (fix) => {
        const removed = source.text.slice(fix.range[0], fix.range[1]);
        const lines = (value) => (value.match(/\r\n|[\r\n\u2028\u2029]/gu) || []).length;

        if (lines(fix.text) === lines(removed)) {
          return false;
        }

        const line = source.getLocFromIndex(fix.range[0]).line;

        return coverageSpans.some((span) => fix.range[0] >= span.end && line < span.lastLine);
      };

      const guarded = Object.create(context, {
        report: {
          value(descriptor) {
            if (!descriptor.fix) {
              context.report(descriptor);

              return;
            }

            context.report({
              ...descriptor,
              fix(fixer) {
                const fix = descriptor.fix(fixer);

                if (!fix || changesCoverageSpan(fix)) {
                  return null;
                }

                if (descriptor.messageId !== 'expectedBlankLine') {
                  return fix;
                }

                const comments = source.getCommentsBefore(descriptor.node);
                const directive = comments.find((comment) =>
                  /^\s*(?:eslint-disable-next-line\b|@ts-(?:expect-error|ignore)\b)/u.test(comment.value)
                );

                if (!directive || fix.range[0] !== fix.range[1] || !/^\s+$/u.test(fix.text)) {
                  return fix;
                }

                const first = comments[0];
                const previous = source.getTokenBefore(first);
                const last = comments[comments.length - 1];

                if (
                  !previous ||
                  previous.loc.end.line !== first.loc.start.line ||
                  fix.range[0] !== last.range[1] ||
                  directive.loc.end.line !== descriptor.node.loc.start.line - 1
                ) {
                  return fix;
                }

                const indent = source.lines[descriptor.node.loc.start.line - 1].match(/^\s*/u)[0];

                return fixer.replaceTextRange([previous.range[1], first.range[0]], '\n\n' + indent);
              }
            });
          }
        }
      });

      return rule.create(guarded);
    }
  };
}

const safeStylistic = {
  ...stylistic,
  rules: {
    ...stylistic.rules,
    'padding-line-between-statements': preserveDirectiveTargets(stylistic.rules['padding-line-between-statements'])
  }
};

const safeJsdoc = {
  ...jsdoc,
  rules: {
    ...jsdoc.rules,
    'lines-before-block': preserveDirectiveTargets(jsdoc.rules['lines-before-block'])
  }
};

const testCaseSpacing = {
  meta: {
    type: 'layout',
    schema: [],
    messages: { separate: 'Leave a blank line between adjacent test cases or suites.' }
  },
  create(context) {
    const source = context.sourceCode;
    const exports = new Set(['test', 'it', 'describe', 'suite']);
    const modifiers = new Set(['only', 'skip', 'todo']);
    const callables = new Set();
    const namespaces = new Set();
    const testContexts = new Set();
    const blocks = [];
    const variable = (identifier) => {
      if (!identifier || identifier.type !== 'Identifier') {
        return undefined;
      }

      let scope = source.getScope(identifier);

      while (scope) {
        if (scope.set.has(identifier.name)) {
          return scope.set.get(identifier.name);
        }

        scope = scope.upper;
      }

      return undefined;
    };

    const property = (node) => (node.computed ? node.property.value : node.property.name);
    const nodeTest = (node) =>
      node?.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'require' &&
      !variable(node.callee)?.defs.length &&
      node.arguments[0]?.value === 'node:test';
    const namespace = (node) => nodeTest(node) || namespaces.has(variable(node));
    const registrar = (node) => {
      if (!node) {
        return false;
      }

      if (node.type === 'Identifier') {
        return callables.has(variable(node));
      }

      if (nodeTest(node)) {
        return true;
      }

      if (node.type !== 'MemberExpression') {
        return false;
      }

      const name = property(node);

      return (
        (namespace(node.object) && exports.has(name)) ||
        (name === 'test' && testContexts.has(variable(node.object))) ||
        (modifiers.has(name) && registrar(node.object))
      );
    };

    const caseCall = (node) => {
      let expression = node;

      while (expression && ['ExpressionStatement', 'AwaitExpression', 'ChainExpression'].includes(expression.type)) {
        expression = expression.expression || expression.argument;
      }

      return expression?.type === 'CallExpression' && registrar(expression.callee);
    };

    const returningCase = (node) => {
      if (!node || !['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)) {
        return false;
      }

      return (
        caseCall(node.body) ||
        (node.body.type === 'BlockStatement' &&
          node.body.body.length === 1 &&
          node.body.body[0].type === 'ReturnStatement' &&
          caseCall(node.body.body[0].argument))
      );
    };

    const caseStatement = (node) => {
      if (caseCall(node)) {
        return true;
      }

      if (node.type === 'BlockStatement') {
        return node.body.some(caseStatement);
      }

      if (
        ['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.type)
      ) {
        return caseStatement(node.body);
      }

      if (node.type === 'IfStatement') {
        return caseStatement(node.consequent) || (node.alternate ? caseStatement(node.alternate) : false);
      }

      return false;
    };

    const mark = (identifier, collection) => {
      const binding = variable(identifier);

      // A reassigned alias no longer has a stable syntactic responsibility.
      if (binding && !binding.references.some((reference) => reference.isWrite() && !reference.init)) {
        collection.add(binding);
      }
    };

    return {
      Program(node) {
        blocks.push(node);
      },
      BlockStatement(node) {
        blocks.push(node);
      },
      ImportDeclaration(node) {
        if (node.source.value !== 'node:test') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') mark(specifier.local, namespaces);
          if (specifier.type === 'ImportDefaultSpecifier' || exports.has(specifier.imported?.name)) {
            mark(specifier.local, callables);
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && namespace(node.init)) {
          for (const item of node.id.properties) {
            if (item.type === 'Property' && exports.has(item.key.name || item.key.value)) mark(item.value, callables);
          }
        } else if (node.id.type === 'Identifier') {
          if (namespace(node.init)) mark(node.id, namespaces);
          if (registrar(node.init) || returningCase(node.init)) mark(node.id, callables);
        }
      },
      FunctionDeclaration(node) {
        if (returningCase(node)) mark(node.id, callables);
      },
      CallExpression(node) {
        if (!registrar(node.callee)) {
          return;
        }

        const callback = node.arguments.at(-1);

        if (callback && ['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type)) {
          mark(callback.params[0], testContexts);
        }
      },
      'Program:exit'() {
        for (const block of blocks) {
          for (let index = 1; index < block.body.length; index++) {
            const previous = block.body[index - 1];
            const current = block.body[index];

            if (
              caseStatement(previous) &&
              caseStatement(current) &&
              !/\r?\n[\t ]*\r?\n/u.test(source.text.slice(previous.range[1], current.range[0]))
            ) {
              context.report({ node: current, messageId: 'separate' });
            }
          }
        }
      }
    };
  }
};

export const readabilityPlugins = {
  '@stylistic': safeStylistic,
  jsdoc: safeJsdoc,
  'go-constant-test-spacing': { rules: { 'adjacent-cases': testCaseSpacing } }
};

export const testSpacingRules = { 'go-constant-test-spacing/adjacent-cases': 'error' };

export const readabilityRules = {
  'jsdoc/lines-before-block': [
    'error',
    {
      lines: 1,
      checkBlockStarts: false,
      ignoreSameLine: true,
      ignoreSingleLines: false,
      excludedTags: []
    }
  ],
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: 'directive', next: '*' },
    { blankLine: 'any', prev: 'directive', next: 'directive' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'return' }
  ]
};

// Only these reviewed whitespace fixes belong in the formatting workflow.
export const readabilityFixRuleIds = Object.freeze(Object.keys(readabilityRules));
