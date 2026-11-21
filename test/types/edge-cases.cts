import Constant = require('../../index.js');

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Type assertions target the actual expression, not a variable already annotated
// unknown. Equal<..., unknown> fails for any: precision regressions are detectable.
const undefinedValue = Constant(undefined);

type UndefinedValue = Expect<Equal<typeof undefinedValue.value, undefined>>;
const nullValue = Constant(null);

type NullValue = Expect<Equal<typeof nullValue.value, null>>;
const bigintValue = Constant(7n);

type BigintValue = Expect<Equal<typeof bigintValue.value, bigint>>;
const unionInput: string | number = Math.random() ? 'x' : 1;
const unionValue = Constant(unionInput);

type UnionValue = Expect<Equal<typeof unionValue.value, string | number>>;
const first = Constant({ enabled: false });

first.value.enabled = true;
// @ts-expect-error Only the reference, not the nested object's fields, is readonly.
first.value = { enabled: true };
const copied = { ...first };
const copyWrapper = Constant(copied);

type CopyValue = Expect<Equal<typeof copyWrapper.value, typeof copied>>;
const { name: copiedName, ...rest } = first;
const restWrapper = Constant(rest);

type RestValue = Expect<Equal<typeof restWrapper.value, typeof rest>>;
// @ts-expect-error Spread/rest does not preserve wrapper identity.
const invalidIdentity: Constant.Value<{ enabled: boolean }> = rest;
const second = Constant(first);

type Reused = Expect<Equal<typeof second, typeof first>>;
const namedWrapper = Constant(first, undefined, 'extra');

type NamedWrapper = Expect<Equal<typeof namedWrapper.value, typeof first>>;
const constructed = new Constant(first);

type Constructed = Expect<Equal<typeof constructed.value, typeof first>>;

const EmptyTuple = Constant.defineType('EmptyTuple', ['a', 'b'], {
  validate() {
    return [] as const;
  }
});
const emptyTuple = EmptyTuple();

type EmptyA = Expect<Equal<typeof emptyTuple.a, undefined>>;
type EmptyB = Expect<Equal<typeof emptyTuple.b, undefined>>;
const ShortTuple = Constant.defineType('ShortTuple', ['a', 'b', 'c'], {
  validate(input: number) {
    return [input, 'label'] as const;
  }
});
const short = ShortTuple(1);

type ShortA = Expect<Equal<typeof short.a, number>>;
type ShortB = Expect<Equal<typeof short.b, 'label'>>;
type ShortC = Expect<Equal<typeof short.c, undefined>>;
const GeneralArray = Constant.defineType('GeneralArray', ['a', 'b'], {
  validate(): number[] {
    return [1];
  }
});
const general = GeneralArray();

type GeneralA = Expect<Equal<typeof general.a, number | undefined>>;
type GeneralB = Expect<Equal<typeof general.b, number | undefined>>;
// @ts-expect-error A non-tuple array need not contain a value at position 0.
const alwaysThere: number = general.a;
const Branch = Constant.defineType('Branch', ['value'], {
  validate(input: string): readonly [number] | undefined {
    return input ? [input.length] : undefined;
  }
});
const branch = Branch('a');

type BranchValue = Expect<Equal<typeof branch.value, string | number>>;
const ErasedArray: (input: string) => void = (input) => [input.length];
const Erased = Constant.defineType('Erased', ['value'], { validate: ErasedArray, valueOf: 'value' });
const erased = Erased('abc');

type ErasedValue = Expect<Equal<typeof erased.value, unknown>>;
type ErasedCoercion = Expect<Equal<ReturnType<typeof erased.valueOf>, unknown>>;
// @ts-expect-error An erased normalization return cannot establish numeric methods.
erased.value.toFixed();
const KnownUndefined = Constant.defineType('KnownUndefined', ['value'], {
  validate(input: number): undefined {
    if (input < 0) throw new Error();
  },
  valueOf: 'value'
});
const known = KnownUndefined(1);

type KnownValue = Expect<Equal<typeof known.value, number>>;
type KnownCoercion = Expect<Equal<ReturnType<typeof known.valueOf>, number>>;
const KnownDefaults = Constant.defineType('Defaults', ['code', 'days'], {
  validate({ code, days = 3 }: { code: string; days?: number }) {
    return [code.trim(), days] as const;
  },
  trackInstances: true
});
const withDefaults = KnownDefaults({ code: 'x' });

type DefaultCode = Expect<Equal<typeof withDefaults.code, string>>;
type DefaultDays = Expect<Equal<typeof withDefaults.days, number>>;
// @ts-expect-error Missing required named input.
KnownDefaults({ days: 3 });
// @ts-expect-error Positional output fields are not the named constructor input.
KnownDefaults('x', 3);
const OptionalTuple = Constant.defineType('Optional', ['code', 'days'], {
  validate(code: string, days?: number): undefined {
    if (!code) throw new Error();
  }
});
const optional = OptionalTuple('x');

type OptionalDays = Expect<Equal<typeof optional.days, number | undefined>>;

const id = Symbol('id');
const SymbolType = Constant.defineType('Symbols', [id, 'label'], {
  validate(value: bigint, label: string) {
    return [value, label] as const;
  },
  valueOf: id,
  trackInstances: true
});
const symbolItem = SymbolType(1n, 'one');

type SymbolField = Expect<Equal<(typeof symbolItem)[typeof id], bigint>>;
type SymbolCoercion = Expect<Equal<ReturnType<typeof symbolItem.valueOf>, bigint>>;
// @ts-expect-error Symbol properties are readonly too.
symbolItem[id] = 2n;
const Special = Constant.defineType('Special', ['__proto__', '', 'constructor'], {
  validate() {
    return [null, 1, 'metadata'] as const;
  }
});
const special = Special();

type EmptyKey = Expect<Equal<(typeof special)[''], 1>>;
type ProtoKey = Expect<Equal<typeof special.__proto__, null>>;
type ConstructorKey = Expect<Equal<typeof special.constructor, 'metadata'>>;
const FunctionField = Constant.defineType('FunctionField', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  },
  valueOf: null
});
const functionField = FunctionField(() => 9);

type FunctionData = Expect<Equal<typeof functionField.valueOf, () => number>>;
const PrimitiveCallback = Constant.defineType('Callback', ['code', 'rank'], {
  validate(code: string, rank: number) {
    return [code, rank] as const;
  },
  valueOf() {
    return this.rank + this.code.length;
  }
});
const primitiveCallback = PrimitiveCallback('a', 2);

type CallbackValue = Expect<Equal<ReturnType<typeof primitiveCallback.valueOf>, number>>;

const Tracked = Constant.defineType<readonly ['code', 'rank'], readonly [string, number]>('Tracked', ['code', 'rank'], {
  trackInstances: true,
  valueOf: 'rank'
});
const tracked = Tracked('x', 1);

type TypedRank = Expect<Equal<typeof tracked.rank, number>>;
const snapshot = Tracked.getInstances();

snapshot.sort((a, b) => a.rank - b.rank);
const maybeFirst = snapshot[0];

if (maybeFirst) {
  const rank: number = maybeFirst.rank;
}

// @ts-expect-error Snapshot lookup is possibly absent with noUncheckedIndexedAccess.
const definitelyFirst: typeof tracked = snapshot[0];

// @ts-expect-error Snapshot element fields remain readonly.
tracked.rank = 2;
// @ts-expect-error Explicit input tuple still restricts arity.
Tracked('x', 1, true);
// @ts-expect-error New construction enforces typed inputs too.
new Tracked(1, 'x');
const Disabled = Constant.defineType('Disabled', ['code'], { trackInstances: false });

type DisabledGet = Expect<Equal<ReturnType<typeof Disabled.getInstances>, never>>;
const flag: boolean = Math.random() > 0.5;
const Conditional = Constant.defineType('Conditional', ['code'], { trackInstances: flag });
const optionalSnapshot = Conditional.getInstances();

type ConditionalSnapshot = Expect<Equal<typeof optionalSnapshot, ReturnType<typeof Conditional>[]>>;
const dynamicKeys: string[] = ['code'];
const Dynamic = Constant.defineType('Dynamic', dynamicKeys, {
  validate() {
    return [3] as const;
  }
});
const dynamic = Dynamic();

type DynamicUnknownKey = Expect<Equal<(typeof dynamic)['absent'], 3 | undefined>>;
// @ts-expect-error Dynamic fields are still readonly.
dynamic['code'] = 3;

// Rejection cases include both callable and constructable forms where relevant.
// @ts-expect-error An unknown own option is not part of the API.
Constant.defineType('Unknown', ['code'], { validator() {} });
// @ts-expect-error Symbols, not boxed symbols or numeric keys, are permitted.
Constant.defineType('Numeric', [0n]);
// @ts-expect-error Sparse schema entries cannot be undefined.
Constant.defineType('Sparse', ['code', undefined]);
// @ts-expect-error A normalized iterable is not a normalized array.
Constant.defineType('Iterable', ['code'], {
  validate() {
    return new Set([1]);
  }
});
// @ts-expect-error Generator callbacks return iterators, not argument arrays.
Constant.defineType('Generator', ['code'], {
  *validate() {
    yield 1;
  }
});
// @ts-expect-error Async generators are unsupported.
Constant.defineType('AsyncGenerator', ['code'], {
  async *validate() {
    yield 1;
  }
});
// @ts-expect-error A promise from a normal function is unsupported as well.
Constant.defineType('Promise', ['code'], {
  validate() {
    return Promise.resolve([1]);
  }
});
// @ts-expect-error Numeric predicate results are not supported.
Constant.defineType('NumberResult', ['code'], {
  validate() {
    return 1;
  }
});
// @ts-expect-error Tracking cannot be enabled with a null value.
Constant.defineType('NullTracking', ['code'], { trackInstances: null });
// @ts-expect-error An undeclared symbol cannot select a field.
Constant.defineType('BadSymbol', ['code'], { valueOf: Symbol('other') });

// A valueOf data field no longer requires an explicit null coercion option.
Constant.defineType('ValueOfDataWithoutNull', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  }
});
// @ts-expect-error Structural output is not a valid explicit input tuple.
Tracked(tracked);
const lookalike = {
  value: 12,
  name: 'Twelve',
  valueOf() {
    return 12;
  }
};
const lookalikeWrapper = Constant(lookalike);

type LookalikeInput = Expect<Equal<typeof lookalikeWrapper.value, typeof lookalike>>;
