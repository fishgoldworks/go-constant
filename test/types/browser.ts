/// <reference path="../../index.d.ts" />
const globalConstant = goConstant(1, 'One');
const globalNumber: number = globalConstant.value;
const nestedCall: number = goConstant.Constant(25).value;
const GlobalType = goConstant.defineType('GlobalType', ['code'], { trackInstances: true });

GlobalType('ok');
GlobalType.getInstances().reverse();
// @ts-expect-error Global browser declarations preserve readonly fields.
globalConstant.value = 2;

const spreadCopy = { ...globalConstant };
const spreadValue: typeof spreadCopy = goConstant(spreadCopy).value;

// @ts-expect-error Browser-global declarations must not predict numeric reuse of a copy.
goConstant(spreadCopy).value.toFixed(2);
const GlobalTyped = goConstant.defineType<['code'], [string]>('GlobalTyped', ['code'], { trackInstances: true });
const globalCode: string = GlobalTyped('ok').code;

GlobalTyped.getInstances().reverse();
const browserEnum = goConstant.defineEnum({ DARK: 'dark' });
const browserEnumValue: 'dark' = browserEnum.DARK.value;

// @ts-expect-error The browser bundle only declares goConstant globally.
Constant(1);
