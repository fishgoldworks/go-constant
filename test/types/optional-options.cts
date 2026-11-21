import Constant = require('../../index.js');
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// An output field called valueOf is valid without a coercion option.
const Data = Constant.defineType('Data', ['valueOf'], {
  validate(value: number) {
    return [value] as const;
  }
});
const data = Data(12);

type DataValue = Expect<Equal<typeof data.valueOf, number>>;
// @ts-expect-error The own numeric field is not a method.
data.valueOf();
const CallableData = Constant.defineType('CallableData', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  },
  trackInstances: true
});
const callable = CallableData(() => 5);

type CallableField = Expect<Equal<ReturnType<typeof callable.valueOf>, number>>;
CallableData.getInstances().reverse();
// @ts-expect-error A real own coercion option still collides with the data field.
Constant.defineType('Collision', ['valueOf'], {
  validate(n: number) {
    return [n] as const;
  },
  valueOf: 'valueOf'
});
// @ts-expect-error A callback option still collides with the data field.
Constant.defineType('Collision', ['valueOf'], {
  validate(n: number) {
    return [n] as const;
  },
  valueOf() {
    return 1;
  }
});

// Optional/nullable hooks cannot promise that normalization always happens.
function optionalOptions(): { validate?: (text: string) => readonly [number] } {
  return {};
}

const Optional = Constant.defineType('Optional', ['code'], optionalOptions());
const optional = Optional('abc');

type OptionalCode = Expect<Equal<typeof optional.code, string | number>>;
// @ts-expect-error A missing hook retains the original string.
optional.code.toFixed();
function nullableOptions(): { validate: ((text: string) => readonly [number]) | null } {
  return { validate: null };
}

const Nullable = Constant.defineType('Nullable', ['code'], nullableOptions());
const nullable = Nullable('abc');

type NullableCode = Expect<Equal<typeof nullable.code, string | number>>;
// @ts-expect-error A null hook retains the original string.
nullable.code.toFixed();
function maybeOptions(): { validate: (text: string) => readonly [number] } | undefined {
  return undefined;
}

const Maybe = Constant.defineType('Maybe', ['code'], maybeOptions());
const maybe = Maybe('abc');

type MaybeCode = Expect<Equal<typeof maybe.code, string | number>>;
// @ts-expect-error An absent options object cannot establish a numeric field.
maybe.code.toFixed();
// Required hooks retain their precise normalized return types.
const Required = Constant.defineType('Required', ['code'], {
  validate(text: string) {
    return [text.length] as const;
  }
});
const required = Required('abc');

type RequiredCode = Expect<Equal<typeof required.code, number>>;
// @ts-expect-error Required normalizers still impose their argument types.
Required(12);

// A boolean-literal property can be optional; that does not enable tracking.
function optionalTracking(): { trackInstances?: true } {
  return {};
}

const MaybeTracked = Constant.defineType('MaybeTracked', ['code'], optionalTracking());

type OptionalRegistry = Expect<Equal<ReturnType<typeof MaybeTracked.getInstances>, ReturnType<typeof MaybeTracked>[]>>;
MaybeTracked.getInstances().reverse(); // Disabled tracking throws before returning.
const AlwaysTracked = Constant.defineType('AlwaysTracked', ['code'], { trackInstances: true });

type RequiredRegistry = Expect<
  Equal<ReturnType<typeof AlwaysTracked.getInstances>, ReturnType<typeof AlwaysTracked>[]>
>;
AlwaysTracked.getInstances().reverse();
const NeverTracked = Constant.defineType('NeverTracked', ['code'], { trackInstances: false });

type DisabledRegistry = Expect<Equal<ReturnType<typeof NeverTracked.getInstances>, never>>;

// Optional selectors must not imply an always-installed valueOf method.
function optionalSelector(): { validate: (n: number) => readonly [number]; valueOf?: 'code' } {
  return {
    validate(n: number) {
      return [n] as const;
    }
  } as { validate: (n: number) => readonly [number]; valueOf?: 'code' };
}

const MaybeCoerced = Constant.defineType('MaybeCoerced', ['code'], optionalSelector());
const maybeCoerced = MaybeCoerced(1);

type OptionalCoercion = Expect<Equal<ReturnType<typeof maybeCoerced.valueOf>, unknown>>;
// @ts-expect-error The default coercion returns the record, not its field.
const alwaysNumeric: number = maybeCoerced.valueOf();

// Presence handling must compose with callbacks, tracking and null schemas.
const MaybeTrackedCallback = Constant.defineType('MaybeTrackedCallback', ['code'], {
  ...optionalTracking(),
  validate(text: string) {
    return [text.length] as const;
  },
  valueOf() {
    return this.code;
  }
});

type CallbackOptionalRegistry = Expect<
  Equal<ReturnType<typeof MaybeTrackedCallback.getInstances>, ReturnType<typeof MaybeTrackedCallback>[]>
>;
const maybeTrackedCallback = MaybeTrackedCallback('abc');

type CallbackPrecision = Expect<Equal<ReturnType<typeof maybeTrackedCallback.valueOf>, number>>;
const EmptyTracked = Constant.defineType('Empty', null, optionalTracking());

type EmptyOptionalRegistry = Expect<
  Equal<ReturnType<typeof EmptyTracked.getInstances>, ReturnType<typeof EmptyTracked>[]>
>;
const OwnUndefined = Constant.defineType('OwnUndefined', ['code'], { validate: undefined, trackInstances: undefined });

type OwnUndefinedRegistry = Expect<Equal<ReturnType<typeof OwnUndefined.getInstances>, never>>;
// @ts-expect-error Capturing the options shape must not swallow a misspelled key.
Constant.defineType('Typo', ['code'], {
  validate(text: string) {
    return [text];
  },
  trackInstance: true
});
// @ts-expect-error The callback overload must also reject unrelated extra options.
Constant.defineType('Typo', ['code'], {
  valueOf() {
    return 1;
  },
  trackInstance: true
});
// @ts-expect-error The data-field overload must also reject unrelated options.
Constant.defineType('Typo', ['valueOf'], {
  validate(n: number) {
    return [n] as const;
  },
  trackInstance: true
});

// Optional normalization also affects the receiver seen by custom coercion.
Constant.defineType('UnsafeCoercion', ['code'], {
  ...optionalOptions(),
  valueOf() {
    // @ts-expect-error The code can still be the unnormalized input string.
    return this.code.toFixed(0);
  }
});
// Optional output fields do not become required because the registry is enabled.
const MaybeAll = Constant.defineType('MaybeAll', ['code'], {
  ...optionalOptions(),
  ...optionalTracking(),
  valueOf: 'code'
});
const maybeAll = MaybeAll('abc');

type MaybeAllCode = Expect<Equal<typeof maybeAll.code, string | number>>;
type MaybeAllCoercion = Expect<Equal<ReturnType<typeof maybeAll.valueOf>, string | number>>;
type MaybeAllRegistry = Expect<Equal<ReturnType<typeof MaybeAll.getInstances>, ReturnType<typeof MaybeAll>[]>>;

const SafeCoercion = Constant.defineType('SafeCoercion', ['code'], {
  ...optionalOptions(),
  valueOf() {
    const code: string | number = this.code;

    return String(code);
  }
});
const safelyCoerced = SafeCoercion('abc');

type SafeCoercionValue = Expect<Equal<ReturnType<typeof safelyCoerced.valueOf>, string>>;
type SafeCoercionField = Expect<Equal<typeof safelyCoerced.code, string | number>>;

// An optional entire configuration is also optional for empty-schema types.
function maybeTrackedOptions(): { trackInstances: true } | undefined {
  return undefined;
}

const MaybeEmpty = Constant.defineType('MaybeEmpty', null, maybeTrackedOptions());

type OptionalEmptyRegistry = Expect<Equal<ReturnType<typeof MaybeEmpty.getInstances>, ReturnType<typeof MaybeEmpty>[]>>;
// The valueOf data-field contract also supports optional normalizers.
const OptionalData = Constant.defineType('OptionalData', ['valueOf'], optionalOptions());
const optionalData = OptionalData('abc');

type OptionalDataValue = Expect<Equal<typeof optionalData.valueOf, string | number>>;
const EmptyOptionsData = Constant.defineType('EmptyOptionsData', ['valueOf'], { trackInstances: true });
const emptyOptionsData = EmptyOptionsData(1);

type UnspecifiedDataValue = Expect<Equal<typeof emptyOptionsData.valueOf, unknown>>;
EmptyOptionsData.getInstances().reverse();

// Complete configuration absence is legal even with a valueOf output field.
const MaybeDataOptions = Constant.defineType('MaybeDataOptions', ['valueOf'], maybeOptions());
const maybeDataOptions = MaybeDataOptions('abc');

type MaybeDataOptionsValue = Expect<Equal<typeof maybeDataOptions.valueOf, string | number>>;
const ExplicitData = Constant.defineType<['valueOf'], [number]>('ExplicitData', ['valueOf'], { trackInstances: true });
const explicitData = ExplicitData(1);

type ExplicitDataValue = Expect<Equal<typeof explicitData.valueOf, number>>;
ExplicitData.getInstances().reverse();
// @ts-expect-error An explicit data-field schema still disallows a coercion selector.
Constant.defineType<['valueOf'], [number]>('Collision', ['valueOf'], { trackInstances: true, valueOf: 'valueOf' });
const ExplicitUndefined = Constant.defineType<['code'], [string]>('ExplicitUndefined', ['code'], {
  validate: undefined,
  trackInstances: undefined
});
const explicitUndefined: string = ExplicitUndefined('abc').code;

Constant.defineType('EmptyUndefined', null, { valueOf: undefined, validate: undefined, trackInstances: undefined });

// Prototype coercion is not copied by object spread, unlike declared own fields.
const SpreadSelector = Constant.defineType('SpreadSelector', ['n'], {
  validate(n: number) {
    return [n] as const;
  },
  valueOf: 'n'
});
const spreadSelector = { ...SpreadSelector(42) };
const spreadField: number = spreadSelector.n;
// @ts-expect-error copying fields does not copy the prototype's numeric coercion
const spreadCoercion: number = spreadSelector.valueOf();
const SpreadCallback = Constant.defineType('SpreadCallback', ['n'], {
  validate(n: number) {
    return [n] as const;
  },
  valueOf() {
    return this.n.toFixed();
  }
});
// @ts-expect-error copying fields does not copy the prototype's string coercion
const spreadCallback: string = { ...SpreadCallback(42) }.valueOf();
const SpreadOwnMethod = Constant.defineType('SpreadOwnMethod', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  }
});
const spreadOwnResult: number = { ...SpreadOwnMethod(() => 7) }.valueOf();

for (const schema of [null, undefined] as const) {
  const EmptyTyped = Constant.defineType('EmptyTyped', schema, {
    validate(text: string) {
      if (!text) throw new Error('empty');
    },
    trackInstances: true
  });

  EmptyTyped('ok');
  new EmptyTyped('ok');
  // @ts-expect-error validator input types apply even when there are no output fields
  EmptyTyped(42);
  // @ts-expect-error required validator inputs cannot be omitted
  EmptyTyped();
  EmptyTyped.getInstances().slice();
}
