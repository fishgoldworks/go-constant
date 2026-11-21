import Constant = require('../../index.js');

// @ts-expect-error The factory is named defineType in 2.0.0.
void Constant.newType;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const basic = Constant(12, 'Twelve');
const number: number = basic.value;
const valueOfNumber: number = basic.valueOf();
const name: string | null = basic.name;

// @ts-expect-error Protected properties are readonly.
basic.value = 2;
// @ts-expect-error Protected properties are readonly.
basic.name = 'Other';
const empty = Constant();

type EmptyValue = Expect<Equal<typeof empty.value, undefined>>;
const reused = Constant(basic);
const reusedValue: number = reused.value;
const wrapper = Constant(basic, undefined);
const originalInside: typeof basic = wrapper.value;
const constructed = new Constant(basic);
const alsoOriginalInside: typeof basic = constructed.value;
const zero = new Constant();

type ZeroValue = Expect<Equal<typeof zero.value, undefined>>;
const literal = {
  value: 1,
  name: 'One',
  valueOf() {
    return 1;
  }
};
const wrappedPlain = Constant(literal);
const plainValue: typeof literal = wrappedPlain.value;
const nested = Constant({ enabled: false });

nested.value.enabled = true;
// @ts-expect-error The default constructor has no instances property.
void Constant.instances;

const Raw = Constant.defineType('Raw', ['code', 'label']);
const raw = Raw(1, 'One');
const unknownCode: unknown = raw.code;
// @ts-expect-error A field name alone does not establish its value type.
const unjustifiedString: string = raw.label;

// @ts-expect-error Known fields are readonly even with unknown values.
raw.code = 2;
// @ts-expect-error Undeclared field names are not fabricated.
void raw.other;
// @ts-expect-error Generated constructors have no instances property.
void Raw.instances;
// @ts-expect-error Method cannot be reassigned.
Raw.getInstances = () => [];

const Category = Constant.defineType('Category', ['code', 'label'], {
  validate(code: string, label: string) {
    return [code.toLowerCase(), label.trim()] as const;
  },
  valueOf: 'code',
  trackInstances: true
});
const category = Category('SERVICES', 'Services');
const categoryCode: string = category.code;
const categoryLabel: string = category.label;
const primitive: string = category.valueOf();
const categories = Category.getInstances();

categories.reverse();
categories.push(category);
const fromSnapshot: string = categories[0].code;

// @ts-expect-error Tracking is accessed through getInstances().
void Category.instances;
// @ts-expect-error Required typed validator input.
Category(1, 'Services');
// @ts-expect-error Required typed validator input is missing.
Category('SERVICES');
// @ts-expect-error Protected fields remain readonly on snapshots.
categories[0].code = 'changed';
// @ts-expect-error Output shape cannot prove same-constructor identity. Runtime reuse remains available.
Category(category);
const newCategory: typeof category = new Category('goods', 'Goods');

const Price = Constant.defineType('Price', ['amount', 'currency'], {
  validate(amount: string, currency: string) {
    return [Number(amount), currency] as const;
  },
  valueOf: 'amount',
  trackInstances: true
});
const price = Price('12', 'NZD');
const amount: number = price.amount;
const currency: string = price.currency;
const amountOf: number = price.valueOf();
// @ts-expect-error Normalized output differs from input.
const amountAsString: string = price.amount;

// @ts-expect-error Factory inputs follow validation input types, not output types.
Price(12, 'NZD');

const Keep = Constant.defineType('Keep', ['code'], {
  validate(code: number): undefined {
    if (code < 0) throw new RangeError();
  }
});
const keep: number = Keep(1).code;
const Short = Constant.defineType('Short', ['code', 'label'], {
  validate() {
    return [1] as const;
  }
});
const missing: undefined = Short().label;
const Maybe = Constant.defineType('Maybe', ['code'], {
  validate(code: string) {
    if (code === '0') {
      return [0] as const;
    }
  }
});
const maybeValue: string | 0 = Maybe('0').code;
// @ts-expect-error The undefined return branch retains the original string input.
const notAlwaysNumber: number = Maybe('other').code;
const Optional = Constant.defineType('Optional', ['code', 'label'], {
  validate(code: number, label?: string) {
    return [code, label] as const;
  }
});
const optionalLabel: string | undefined = Optional(1).label;
const OptionalInput = Constant.defineType('OptionalInput', ['code', 'label'], {
  validate(code: number, label?: string): undefined {
    if (code < 0) throw new Error();
  }
});
const optionalInputLabel: string | undefined = OptionalInput(1).label;
const ArrayReturn = Constant.defineType('ArrayReturn', ['code', 'label'], {
  validate(code: number) {
    return [code];
  }
});
const arrayLabel: number | undefined = ArrayReturn(1).label;
// @ts-expect-error General arrays can be too short to populate a field.
const definitelyNumber: number = ArrayReturn(1).label;

const key = Symbol('key');
const SymbolType = Constant.defineType('SymbolType', [key], {
  validate(value: string) {
    return [value] as const;
  },
  valueOf: key
});
const symbolValue: string = SymbolType('x')[key];
const symbolPrimitive: string = SymbolType('x').valueOf();
const Callback = Constant.defineType('Callback', ['code'], {
  validate(code: number) {
    return [code] as const;
  },
  valueOf() {
    return this.code + 1;
  }
});
const callbackNumber: number = Callback(1).valueOf();
const Data = Constant.defineType('Data', ['valueOf']);
const dataValue: unknown = Data(1).valueOf;

// @ts-expect-error A data property named valueOf is not automatically a method.
Data(1).valueOf();

const Typed = Constant.defineType<['code', 'label'], [number, string]>('Typed', ['code', 'label']);
const explicitlyTyped: string = Typed(1, 'One').label;

// @ts-expect-error Explicit argument tuple is enforced.
Typed('1', 'One');

// @ts-expect-error Unknown selector is not a declared field.
Constant.defineType('Invalid', ['code'], { valueOf: 'missing' });
// @ts-expect-error Callback booleans are invalid, not a predicate convention.
Constant.defineType('Invalid', ['code'], {
  validate() {
    return false;
  }
});
// @ts-expect-error Asynchronous validation is unsupported.
Constant.defineType('Invalid', ['code'], {
  async validate() {
    return [1];
  }
});
// @ts-expect-error null is not a supported callback result.
Constant.defineType('Invalid', ['code'], {
  validate() {
    return null;
  }
});
// @ts-expect-error trackInstances must be boolean.
Constant.defineType('Invalid', [], { trackInstances: 'yes' });
// @ts-expect-error Use trackInstances to configure tracking.
Constant.defineType('OldOption', [], { saveInstances: true });
// @ts-expect-error Only strings and symbols are declared field keys.
Constant.defineType('Invalid', [123]);

const unknownKeys: string[] = ['code'];
const Dynamic = Constant.defineType('Dynamic', unknownKeys);
const dynamic: unknown = Dynamic(1).whatever;
const configuredFlag: boolean = Math.random() > 0.5;
const Conditional = Constant.defineType('Conditional', ['code'], { trackInstances: configuredFlag });
const conditionalSnapshot: ReturnType<typeof Conditional>[] = Conditional.getInstances();
const noFields = Constant.defineType('Empty');
const noKeys: [] = [];
const EmptyType = Constant.defineType('Empty', noKeys);

EmptyType(1, 2);
noFields();

const CallbackOnly = Constant.defineType('CallbackOnly', ['code'], {
  valueOf() {
    return String(this.code);
  },
  trackInstances: true
});
const callbackOnlyString: string = CallbackOnly(12).valueOf();
const callbackOnlySnapshot = CallbackOnly.getInstances();

callbackOnlySnapshot.reverse();
// @ts-expect-error An explicit nonempty schema cannot be omitted.
Constant.defineType<['code'], [number]>('MissingFields');
// @ts-expect-error An explicit nonempty schema cannot be null.
Constant.defineType<['code'], [number]>('MissingFields', null);
// @ts-expect-error The valueOf method would collide with a declared valueOf field.
Constant.defineType('Collision', ['valueOf'], { valueOf: 'valueOf' });
// @ts-expect-error A callback also collides with a declared valueOf field.
Constant.defineType('Collision', ['valueOf'], {
  valueOf() {
    return 1;
  }
});
// @ts-expect-error A callback with a validator still collides with a declared valueOf field.
Constant.defineType('Collision', ['valueOf'], {
  validate(value: number) {
    return [value] as const;
  },
  valueOf() {
    return 1;
  }
});
const EmptyTracked = Constant.defineType('Empty', null, { trackInstances: true });

EmptyTracked().valueOf();
EmptyTracked.getInstances().reverse();
import focusedEnum = require('go-constant/defineEnum');
import focusedFactory = require('go-constant/Constant');
import focusedType = require('go-constant/defineType');

const focusedValue: 'ready' = focusedEnum({ READY: 'ready' }).READY.value;
const wrapped: number = focusedFactory(1).value;
const RecordType = focusedType('Record', ['value']);
const recordValue: unknown = RecordType(1).value;
