import Constant = require('../../index.js');
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The schema contains one selected key, not all members of its static key type.
function selected(): 'left' | 'right' {
  return 'left';
}

const Choice = Constant.defineType('Choice', [selected()], {
  validate(n: number) {
    return [n] as const;
  },
  trackInstances: true
});
const choice = Choice(42);

type Left = Expect<Equal<typeof choice.left, number | undefined>>;
type Right = Expect<Equal<typeof choice.right, number | undefined>>;
// @ts-expect-error A possible schema key is not necessarily present.
choice.right.toFixed();
// @ts-expect-error Optional declared fields remain read-only.
choice.left = 2;
const registered = Choice.getInstances()[0]!;

type Registered = Expect<Equal<typeof registered.right, number | undefined>>;
if (choice.right !== undefined) {
  const numeric: number = choice.right;
}

function wideKey(): string {
  return 'left';
}

const Wide = Constant.defineType('Wide', [wideKey()], {
  validate(n: number) {
    return [n] as const;
  }
});
const wide = Wide(42);

type WideMissing = Expect<Equal<(typeof wide)['missing'], number | undefined>>;
// @ts-expect-error A string key does not establish that every string field exists.
wide['missing'].toFixed();

// An index signature must include fixed fields whose names it can overlap.
const Mixed = Constant.defineType('Mixed', [wideKey(), 'fixed'], {
  validate(n: number, fixed: boolean) {
    return [n, fixed] as const;
  }
});
const mixed = Mixed(1, true);

type Fixed = Expect<Equal<typeof mixed.fixed, boolean>>;
const anyField = mixed[wideKey()];

type WideAccess = Expect<Equal<typeof anyField, number | boolean | undefined>>;
// @ts-expect-error Fixed fields keep their own (not all indexed) value types.
const numericFixed: number = mixed.fixed;
// @ts-expect-error Index access can reach a fixed boolean field.
const numericOnly: number | undefined = anyField;

// Finite overlapping alternatives do not erase a guaranteed literal field.
const Overlap = Constant.defineType('Overlap', [selected(), 'right'], {
  validate(n: number, fixed: boolean) {
    return [n, fixed] as const;
  }
});
const overlap = Overlap(1, true);

type FixedRight = Expect<Equal<typeof overlap.right, boolean>>;
type PossibleLeft = Expect<Equal<typeof overlap.left, number | boolean | undefined>>;

function pattern(): `field_${string}` {
  return 'field_left';
}

const Pattern = Constant.defineType('Pattern', [pattern(), 'tag'], {
  validate(n: number, tag: boolean) {
    return [n, tag] as const;
  }
});
const patternItem = Pattern(2, false);

type PatternMissing = Expect<Equal<(typeof patternItem)['field_absent'], number | undefined>>;
type PatternTag = Expect<Equal<typeof patternItem.tag, boolean>>;
// @ts-expect-error An infinite template-literal key pattern is not a required field.
patternItem['field_absent'].toFixed();

const leftSymbol = Symbol('left');
const rightSymbol = Symbol('right');

function symbolKey(): typeof leftSymbol | typeof rightSymbol {
  return leftSymbol;
}

const Symbols = Constant.defineType('Symbols', [symbolKey()], {
  validate(n: number) {
    return [n] as const;
  }
});
const symbols = Symbols(3);

type SymbolRight = Expect<Equal<(typeof symbols)[typeof rightSymbol], number | undefined>>;
// @ts-expect-error The other symbol need not exist.
symbols[rightSymbol].toFixed();
function broadSymbol(): symbol {
  return leftSymbol;
}

const BroadSymbol = Constant.defineType('BroadSymbol', [broadSymbol(), 'label'], {
  validate(n: number, label: string) {
    return [n, label] as const;
  }
});
const broadSymbolItem = BroadSymbol(1, 'name');

type UnknownSymbol = Expect<Equal<(typeof broadSymbolItem)[typeof rightSymbol], number | undefined>>;
type SymbolLabel = Expect<Equal<typeof broadSymbolItem.label, string>>;

// Exact literals and literal unique symbols remain required and precise.
const Literal = Constant.defineType('Literal', ['code', leftSymbol], {
  validate(code: string, n: number) {
    return [code, n] as const;
  },
  valueOf: leftSymbol
});
const literal = Literal('x', 1);

type LiteralCode = Expect<Equal<typeof literal.code, string>>;
type LiteralSymbol = Expect<Equal<(typeof literal)[typeof leftSymbol], number>>;
type LiteralCoercion = Expect<Equal<ReturnType<typeof literal.valueOf>, number>>;
const Named = Constant.defineType<['left' | 'right', 'label'], [number, string]>('Named', [selected(), 'label'], {
  trackInstances: true
});
const named = Named(3, 'Label');

type NamedLeft = Expect<Equal<typeof named.left, number | undefined>>;
type NamedLabel = Expect<Equal<typeof named.label, string>>;
const Empty = Constant.defineType('Empty', [] as const);

type EmptyKeys = Expect<Equal<keyof ReturnType<typeof Empty>, 'valueOf'>>;

// General dynamic arrays remain conservative (the original supported behavior).
const fields: string[] = ['code'];
const ArrayType = Constant.defineType('Array', fields, {
  validate() {
    return [3] as const;
  }
});
const arrayItem = ArrayType();

type Dynamic = Expect<Equal<(typeof arrayItem)['missing'], 3 | undefined>>;

// Object.prototype names are still singleton keys, not broad index signatures.
const MethodNames = Constant.defineType('MethodNames', ['toString', 'constructor', 'hasOwnProperty'], {
  validate() {
    return [1, false, 'own'] as const;
  }
});
const methodNames = MethodNames();

type StringMethodField = Expect<Equal<typeof methodNames.toString, 1>>;
type ConstructorField = Expect<Equal<typeof methodNames.constructor, false>>;
type OwnMethodField = Expect<Equal<typeof methodNames.hasOwnProperty, 'own'>>;

function tupleVariant(): readonly ['a'] | readonly ['b'] {
  return ['a'];
}

const Variant = Constant.defineType('Variant', tupleVariant(), {
  validate(n: number) {
    return [n] as const;
  }
});
const variant = Variant(1);

// @ts-expect-error One of the two complete schemas was selected, not both.
variant.a.toFixed();
if ('a' in variant) {
  const variantA: number = variant.a;
}

function finitePattern(): `field_${'a' | 'b'}` {
  return 'field_a';
}

const FinitePattern = Constant.defineType('FinitePattern', [finitePattern()], {
  validate(n: number) {
    return [n] as const;
  }
});
const finite = FinitePattern(1);

type FiniteA = Expect<Equal<typeof finite.field_a, number | undefined>>;
type FiniteB = Expect<Equal<typeof finite.field_b, number | undefined>>;
