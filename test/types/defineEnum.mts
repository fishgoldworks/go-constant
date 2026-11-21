import Constant, { Constant as rootNamed, defineEnum } from 'go-constant';
import focusedConstant, { Constant as namedConstant } from 'go-constant/Constant';
import focusedType, { defineType as namedType } from 'go-constant/defineType';
import focused, { defineEnum as named } from 'go-constant/defineEnum';

const Status = defineEnum({ DRAFT: 'draft', LIVE: { value: 0, label: 'Live' }, 10: 10 });
const draft: 'draft' = Status.DRAFT.value;
const label: 'Live' = Status.LIVE.label;
const ten: 10 = Status[10].value;
const unnamed: null = Status.name;
const nullName: null = defineEnum({}, null).name;
const undefinedName: null = defineEnum({}, undefined).name;
const Field = focused({ NAME: { value: 'name', name: 'Display name' } }, 'Field');
const enumName: 'Field' = Field.name;
const metadataName: 'Display name' = Field.NAME.name;
const matchedMetadata: 'Display name' | undefined = Field.fromValue('name')?.name;
const enumForGenericHelper: focused.Enum<{ NAME: { value: 'name'; name: 'Display name' } }> = Field;

function nameFromInput(name: string | undefined): string | null {
  return defineEnum({ ACTIVE: 'active' }, name).name;
}

function forwardEnum(...args: Parameters<typeof defineEnum>) {
  return defineEnum(...args);
}

const forwardedName: string | null = forwardEnum({ ACTIVE: 'active' }).name;

// @ts-expect-error Enum names are readonly.
Field.name = 'Field';
// @ts-expect-error The top-level key name is reserved even for an unnamed enum.
defineEnum({ name: 'reserved' });
// @ts-expect-error Definitions come first.
defineEnum('Field', {});
// @ts-expect-error Names are strings or nullish.
defineEnum({}, 42);

const fromRoot: typeof defineEnum = Constant.defineEnum;
const fromSubpath: typeof defineEnum = focused;
const fromNamed: typeof defineEnum = named;
const rootFactory: typeof Constant = rootNamed;
const focusedFactory: typeof Constant = focusedConstant;
const focusedNamedFactory: typeof Constant = namedConstant;
const fromFocusedType: typeof Constant.defineType = focusedType;
const fromNamedType: typeof Constant.defineType = namedType;

const Size = focusedType('Size', ['value', 'width'], {
  validate(value: 'small', width: number) {
    return [value, width] as const;
  },
  valueOf: 'width'
});
const small = Size('small', 64);
const copiedSizes = defineEnum({ SMALL: { ...small } });
const referencedSizes = defineEnum({ SMALL: { value: small.value, preset: small } });
const copiedWidth: number | undefined = copiedSizes.fromValue('small')?.width;
const originalWidth: number = referencedSizes.SMALL.preset.valueOf();
// @ts-expect-error Spreading the record omits its configured numeric coercion method.
const copiedCoercion: number = copiedSizes.SMALL.valueOf();

const liveLabel: 'Live' | undefined = Status.fromValue(0)?.label;
const foundDraft: typeof Status.DRAFT | undefined = Status.fromValue('draft');
const missing: undefined = Status.fromValue('0');

function findKnown(value: 0 | 'draft'): typeof Status.LIVE | typeof Status.DRAFT | undefined {
  return Status.fromValue(value);
}

const Widened = defineEnum({ DYNAMIC: String('dynamic'), LIVE: { value: 0, label: 'Live' } });
const fromWidenedString: typeof Widened.DYNAMIC | undefined = Widened.fromValue('dynamic');

enum ExternalStatus {
  LIVE = 0
}
const fromNumericEnum: typeof Status.LIVE | (typeof Status)[10] | undefined = Status.fromValue(ExternalStatus.LIVE);
// @ts-expect-error A numeric enum input can contain another number at runtime.
const tooPrecise: typeof Status.LIVE | undefined = Status.fromValue(ExternalStatus.LIVE);

function findFromErasedCallback(read: () => void): 'draft' | 0 | 10 | undefined {
  return Status.fromValue(read())?.value;
}

function findFromStructuralInput(input: object): 'draft' | 0 | 10 | undefined {
  return Status.fromValue(input)?.value;
}

// @ts-expect-error Instance tracking is available on generated types.
Constant.getInstances();

function describe(input: unknown): 'draft' | 0 | 10 | undefined {
  return Status.fromValue(input)?.value;
}

function missRemainsString(input: string | number): string | number {
  const Dynamic = defineEnum({ ONE: String('one') });

  if (!Dynamic.hasValue(input)) {
    // @ts-expect-error A miss can still be a string.
    const assumedNumber: number = input;

    return assumedNumber;
  }

  return input;
}

// @ts-expect-error Member arrays are readonly.
Status.members.pop();
// @ts-expect-error Stored values are readonly.
Status.DRAFT.value = 'draft';
// @ts-expect-error Enum entries are readonly.
Status.LIVE = Status.LIVE;
// @ts-expect-error Definitions require a string or numeric value.
defineEnum({ INVALID: { label: 'Missing value' } });
// @ts-expect-error Helper names are reserved.
defineEnum({ members: 'reserved' });
// @ts-expect-error Array definitions are unsupported.
defineEnum(['not a record']);
// @ts-expect-error An array is invalid even when it has a value property.
defineEnum({ INVALID: Object.assign([], { value: 'array' }) });
// @ts-expect-error A callable is invalid even when it has a value property.
defineEnum({ INVALID: Object.assign(() => {}, { value: 'callable' }) });

declare const dictionary: Record<`ENTRY_${string}`, 'one'>;
const Dynamic = defineEnum(dictionary);
const dynamicValue: 'one' | undefined = Dynamic.fromValue('one')?.value;
// @ts-expect-error A patterned index signature does not guarantee a named entry.
const missingValue = Dynamic.ENTRY_missing.value;
