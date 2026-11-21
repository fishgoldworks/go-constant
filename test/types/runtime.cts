import Constant = require('../../index.js');

let assertions = 0;

function equal(actual: unknown, expected: unknown): void {
  assertions++;
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

function throwsError(action: () => unknown): void {
  let thrown: unknown;

  try {
    action();
  } catch (error) {
    thrown = error;
  }

  equal(thrown instanceof Error && thrown.constructor === Error, true);
}

const original = Constant(12, 'Twelve');
const copy = { ...original };
const wrappedCopy = Constant(copy);
const actualCopy: typeof copy = wrappedCopy.value;

equal(actualCopy, copy);
equal(actualCopy.value, 12);
const reused = Constant(original);
const numeric: number = reused.value;

equal(numeric.toFixed(2), '12.00');
equal(reused, original);
const explicit = new Constant(original);
const inner: typeof original = explicit.value;

equal(inner, original);

const erased: (code: string) => void = (code) => [code.length];
const Erased = Constant.defineType('Erased', ['code'], { validate: erased });
const unknownValue: unknown = Erased('abc').code;

equal(typeof unknownValue, 'number');
if (typeof unknownValue !== 'number') throw new TypeError('expected normalized number');
equal(unknownValue.toFixed(2), '3.00');
const Keep = Constant.defineType('Keep', ['code'], {
  validate(code: string): undefined {
    if (!code) throw new Error('empty');
  }
});
const text: string = Keep('hello').code;

equal(text.toUpperCase(), 'HELLO');
const Priority = Constant.defineType<['code', 'rank'], [string, number]>('Priority', ['code', 'rank'], {
  trackInstances: true,
  valueOf: 'rank'
});
const high = Priority('high', 3);
const rank: number = high.rank;

equal(rank, 3);
equal(Priority.getInstances()[0], high);
equal('instances' in Priority, false);
equal(high.valueOf(), 3);

const Delivery = Constant.defineType('Delivery', ['code', 'minDays', 'maxDays'], {
  trackInstances: true,
  validate({ code, minDays = 1, maxDays = 3 }: { code: string; minDays?: number; maxDays?: number }) {
    if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays) {
      throw new RangeError('invalid day range');
    }

    return [code.trim().toLowerCase(), minDays, maxDays] as const;
  }
});
const courier = Delivery({ code: ' COURIER ' });
const days: number = courier.minDays;
const code: string = courier.code;

equal(days, 1);
equal(code, 'courier');
equal(Delivery.getInstances()[0], courier);

// Additional boundary probes compile and then execute, so static expectations
// cannot pass solely through annotations divorced from actual returned values.
const Short = Constant.defineType('Short', ['left', 'right'], {
  validate(input: number) {
    return [input] as const;
  }
});
const short = Short(7);
const left: number = short.left;
const missing: undefined = short.right;

equal(left, 7);
equal(missing, undefined);
equal(Object.prototype.hasOwnProperty.call(short, 'right'), true);
const GeneralArray = Constant.defineType('GeneralArray', ['left', 'right'], {
  validate(): number[] {
    return [4];
  }
});
const general = GeneralArray();
const maybeLeft: number | undefined = general.left;
const maybeRight: number | undefined = general.right;

equal(maybeLeft, 4);
equal(maybeRight, undefined);
const Conditional = Constant.defineType('Conditional', ['value'], {
  validate(input: string): readonly [number] | undefined {
    return input.length > 2 ? [input.length] : undefined;
  }
});
const transformed: string | number = Conditional('hello').value;
const retained: string | number = Conditional('hi').value;

equal(transformed, 5);
equal(retained, 'hi');
const token = Symbol('token');
const Symbols = Constant.defineType('Symbols', [token], {
  validate(value: bigint) {
    return [value] as const;
  },
  valueOf: token,
  trackInstances: true
});
const symbolItem = Symbols(8n);
const symbolValue: bigint = symbolItem[token];
const symbolCoercion: bigint = symbolItem.valueOf();

equal(symbolValue, 8n);
equal(symbolCoercion, 8n);
equal(Symbols.getInstances()[0], symbolItem);
const FunctionData = Constant.defineType('FunctionData', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  },
  valueOf: null
});
const fn = () => 11;
const functionData = FunctionData(fn);
const functionValue: () => number = functionData.valueOf;

equal(functionValue, fn);
equal(functionValue(), 11);
equal(Object.prototype.hasOwnProperty.call(functionData, 'valueOf'), true);
const Positional = Constant.defineType<readonly ['code', 'rank'], readonly [string, number]>(
  'Positional',
  ['code', 'rank'],
  { valueOf: 'rank', trackInstances: true }
);
const positional = new Positional('high', 30);
const preciseRank: number = positional.rank;
const conservativeCoercion: unknown = positional.valueOf();

equal(preciseRank, 30);
equal(conservativeCoercion, 30);
const before = Positional.getInstances();

Positional('normal', 20);
equal(before.length, 1);
equal(Positional.getInstances().length, 2);
const restCopy = { ...original };
const restValue: typeof restCopy = Constant(restCopy).value;

equal(restValue, restCopy);
const DefaultInput = Constant.defineType('DefaultInput', ['code', 'days'], {
  validate({ code, days = 3 }: { code: string; days?: number }) {
    return [code, days] as const;
  }
});
const defaultDays: number = DefaultInput({ code: 'a' }).days;
const specifiedDays: number = DefaultInput({ code: 'a', days: 0 }).days;

equal(defaultDays, 3);
equal(specifiedDays, 0);

// Optional configuration must agree with runtime on both execution branches.
function optionalNormalization(enabled: boolean): { validate?: (text: string) => readonly [number] } {
  return enabled
    ? {
        validate(text) {
          return [text.length] as const;
        }
      }
    : {};
}

function optionalFlag(enabled: boolean): { trackInstances?: true } {
  return enabled ? { trackInstances: true } : {};
}

for (const enabled of [false, true]) {
  const MaybeNormalized = Constant.defineType('MaybeNormalized', ['code'], {
    ...optionalNormalization(enabled),
    ...optionalFlag(enabled),
    valueOf: 'code'
  });
  const item = MaybeNormalized('abc');
  const field: string | number = item.code;
  const converted: string | number = item.valueOf();

  equal(field, enabled ? 3 : 'abc');
  equal(converted, field);
  if (enabled) {
    const snapshot = MaybeNormalized.getInstances();

    equal(snapshot.length, 1);
    equal(snapshot[0], item);
  } else {
    throwsError(MaybeNormalized.getInstances);
  }

  const Callback = Constant.defineType('OptionalCallback', ['code'], {
    ...optionalNormalization(enabled),
    valueOf() {
      const code: string | number = this.code;

      return typeof code + ':' + code;
    }
  });

  equal(Callback('abc').valueOf(), enabled ? 'number:3' : 'string:abc');
  const DataField = Constant.defineType('DataField', ['valueOf'], optionalNormalization(enabled));
  const dataField: string | number = DataField('abc').valueOf;

  equal(dataField, field);
}

function nullableNormalization(): { validate: ((text: string) => readonly [number]) | null } {
  return { validate: null };
}

const NullableNormalization = Constant.defineType('NullableNormalization', ['code'], nullableNormalization());
const originalString: string | number = NullableNormalization('abc').code;

equal(originalString, 'abc');
function absentConfiguration(): { validate: (text: string) => readonly [number] } | undefined {
  return undefined;
}

const AbsentConfiguration = Constant.defineType('AbsentConfiguration', ['code'], absentConfiguration());

equal(AbsentConfiguration('abc').code, 'abc');
const NumberData = Constant.defineType('NumberData', ['valueOf'], {
  validate(n: number) {
    return [n] as const;
  }
});
const numberData: number = NumberData(9).valueOf;

equal(numberData, 9);
const CallableData = Constant.defineType('CallableData', ['valueOf'], {
  validate(fn: () => number) {
    return [fn] as const;
  }
});
const callableData = CallableData(() => 19);

equal(callableData.valueOf(), 19);
function optionalEmptyConfiguration(): { trackInstances: true } | undefined {
  return undefined;
}

const OptionalEmpty = Constant.defineType('OptionalEmpty', null, optionalEmptyConfiguration());

throwsError(OptionalEmpty.getInstances);
// Dynamic schema keys name only the selected runtime field.
function selectedDynamicField(): 'left' | 'right' {
  return 'left';
}

const DynamicSelected = Constant.defineType('DynamicSelected', [selectedDynamicField()], {
  validate(n: number) {
    return [n] as const;
  },
  trackInstances: true
});
const dynamicSelected = DynamicSelected(42);
const selectedLeft: number | undefined = dynamicSelected.left;
const selectedRight: number | undefined = dynamicSelected.right;

equal(selectedLeft, 42);
equal(selectedRight, undefined);
equal('right' in dynamicSelected, false);
equal(DynamicSelected.getInstances()[0].right, undefined);
if (selectedLeft !== undefined) equal(selectedLeft.toFixed(0), '42');
function anyDynamicKey(): string {
  return 'left';
}

const DynamicMixed = Constant.defineType('DynamicMixed', [anyDynamicKey(), 'fixed'], {
  validate(n: number, fixed: boolean) {
    return [n, fixed] as const;
  }
});
const dynamicMixed = DynamicMixed(7, true);

function lookupKey(useFixed: boolean): string {
  return useFixed ? 'fixed' : 'left';
}

for (const useFixed of [false, true]) {
  const indexed: number | boolean | undefined = dynamicMixed[lookupKey(useFixed)];

  equal(indexed, useFixed ? true : 7);
}

equal(dynamicMixed['missing'], undefined);
equal(dynamicMixed.fixed, true);
function patternKey(): `field_${string}` {
  return 'field_left';
}

const DynamicPattern = Constant.defineType('DynamicPattern', [patternKey()], {
  validate(n: number) {
    return [n] as const;
  }
});
const dynamicPattern = DynamicPattern(3);

equal(dynamicPattern['field_left'], 3);
equal(dynamicPattern['field_missing'], undefined);

const SpreadCoercion = Constant.defineType('SpreadCoercion', ['n'], {
  validate(n: number) {
    return [n] as const;
  },
  valueOf: 'n'
});
const originalCoercion = SpreadCoercion(42);
const plainCopy = { ...originalCoercion };

equal(originalCoercion.valueOf(), 42);
equal(plainCopy.n, 42);
equal(plainCopy.valueOf(), plainCopy);
for (const schema of [null, undefined] as const) {
  const EmptyValidated = Constant.defineType('EmptyValidated', schema, {
    validate(text: string) {
      equal(text, 'ok');
    },
    trackInstances: true
  });
  const empty = EmptyValidated('ok');

  equal(Object.keys(empty).length, 0);
  equal(EmptyValidated.getInstances()[0], empty);
}

console.log(`Compiled TypeScript/runtime regression assertions: ${assertions} passed.`);
