import Constant, { defineType, type Value } from '../../index.mjs';
import CjsConstant, { defineType as cjsDefineType } from '../../index.js';

const item: Value<number> = Constant(1);
const other: Constant.Value<string> = Constant('x');
const NumberRecord = defineType('NumberRecord', ['value'], {
  validate(value: string) {
    return [Number(value)] as const;
  },
  valueOf: 'value',
  trackInstances: true
});
const value: number = NumberRecord('12').value;

// @ts-expect-error ESM declarations preserve input validation types.
NumberRecord(12);
// @ts-expect-error ESM declarations preserve readonly fields.
NumberRecord('12').value = 2;
const ConstructorType = cjsDefineType('Untyped', ['code']);

ConstructorType(1);
CjsConstant('x');
void other.value;

const copied = { ...item };
const copiedValue: typeof copied = Constant(copied).value;

// @ts-expect-error Copies do not reuse the primitive value.
Constant(copied).value.toFixed(2);
const Explicit = defineType<['code', 'rank'], [string, number]>('Explicit', ['code', 'rank'], {
  trackInstances: true,
  valueOf: 'rank'
});

Explicit('high', 30);
const trackedRank: number = Explicit.getInstances()[0].rank;

// @ts-expect-error Generated types advertise input arguments, not structural reuse.
NumberRecord(NumberRecord('12'));
