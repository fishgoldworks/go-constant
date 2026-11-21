import Constant = require('../../index.js');

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// A spread copy is a plain input object, not a reusable wrapper.
const original = Constant(12, 'Twelve');
const copy = { ...original };
const wrappedCopy = Constant(copy);
const actualInput: typeof copy = wrappedCopy.value;

// @ts-expect-error The value is the copy, not its numeric field.
wrappedCopy.value.toFixed(2);
// @ts-expect-error A spread copy has no wrapper identity.
const notAWrapper: Constant.Value<number> = copy;
const reused = Constant(original);
const actualNumber: number = reused.value;
const explicitNew = new Constant(original);
const wrappedOriginal: typeof original = explicitNew.value;
const copyTwice = { ...copy };
const nestedCopy: typeof copyTwice = Constant(copyTwice).value;
const lookalike = {
  value: 12,
  name: 'Twelve',
  valueOf() {
    return 12;
  }
};
const actualLookalike: typeof lookalike = Constant(lookalike).value;

// Per-constructor runtime identity cannot be proved by structural field types.
const A = Constant.defineType<['code'], [string]>('A', ['code']);
const B = Constant.defineType<['code'], [string]>('B', ['code']);
const a = A('alpha');

// @ts-expect-error B expects an input string, not an instance from A.
B(a);
// @ts-expect-error Even A(a) is not promised by the typed input contract.
A(a);
const ValidatedA = Constant.defineType('ValidatedA', ['code'], {
  validate(code: string) {
    return [code.trim()] as const;
  }
});
const ValidatedB = Constant.defineType('ValidatedB', ['code'], {
  validate(code: string) {
    return [code.trim()] as const;
  }
});

// @ts-expect-error A same-shaped instance must not bypass another input contract.
ValidatedB(ValidatedA('alpha'));
const raw = Constant.defineType('Raw', ['code']);

raw(raw('alpha')); // Unknown input tuples remain permissive.

// void erases return values; only undefined proves that inputs are retained.
const erased: (code: string) => void = (code) => [code.length];
const Erased = Constant.defineType('Erased', ['code'], { validate: erased });
const erasedValue: unknown = Erased('abc').code;

type ErasedUnknown = Expect<Equal<typeof erasedValue, unknown>>;
// @ts-expect-error A void-returning hook can normalize to a different field type.
const noFalseString: string = Erased('abc').code;
const Keep = Constant.defineType('Keep', ['code'], {
  validate(code: string): undefined {
    if (!code) throw new TypeError('empty');
  }
});
const kept: string = Keep('abc').code;
const Normalized = Constant.defineType('Normalized', ['code'], {
  validate(code: string) {
    return [code.length] as const;
  }
});
const normalized: number = Normalized('abc').code;
const Maybe = Constant.defineType('Maybe', ['code'], {
  validate(code: string): readonly [number] | undefined {
    if (code.length > 2) {
      return [code.length];
    }
  }
});
const maybe: string | number = Maybe('abc').code;
// @ts-expect-error An undefined branch can retain the input string.
const notAlwaysNumber: number = Maybe('a').code;

// Two explicit type arguments must compose with ordinary options.
const Tracked = Constant.defineType<['code', 'rank'], [string, number]>('Tracked', ['code', 'rank'], {
  trackInstances: true
});
const trackedCode: string = Tracked('urgent', 30).code;
const trackedRank: number = Tracked.getInstances()[0].rank;

Tracked.getInstances().reverse();
// @ts-expect-error Explicit input types remain enforced with tracking enabled.
Tracked(30, 'urgent');
const Coerced = Constant.defineType<['code', 'rank'], [string, number]>('Coerced', ['code', 'rank'], {
  valueOf: 'rank'
});
const rankField: number = Coerced('urgent', 30).rank;
const coercedValue: unknown = Coerced('urgent', 30).valueOf();
const Both = Constant.defineType<['code', 'rank'], [string, number]>('Both', ['code', 'rank'], {
  trackInstances: true,
  valueOf: 'rank'
});

Both.getInstances().reverse();
const callback = Constant.defineType<['rank'], [number]>('Callback', ['rank'], {
  trackInstances: true,
  valueOf() {
    return this.rank + 1;
  }
});
const callbackRank: number = callback(30).rank;
const callbackResult: unknown = callback(30).valueOf();

// @ts-expect-error Misspelled options are rejected for explicit generic calls too.
Constant.defineType<['code'], [string]>('Typo', ['code'], { trackInstance: true });
// @ts-expect-error Explicit input types do not make arbitrary selectors valid.
Constant.defineType<['code'], [string]>('BadKey', ['code'], { valueOf: 'missing' });
// @ts-expect-error valueOf cannot be a configured method and a data field.
Constant.defineType<['valueOf'], [string]>('Collision', ['valueOf'], { trackInstances: true, valueOf: 'valueOf' });
