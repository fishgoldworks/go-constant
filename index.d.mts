import Constant = require('./index.js');
export { Constant, Constant as default };
export declare const defineEnum: typeof Constant.defineEnum;

/**
 * Creates a reusable constructor for records with read-only declared fields.
 * Call the returned constructor with or without `new` to create records.
 * The schema and own options are captured once. New records are extensible,
 * and referenced values retain their original mutability. Tracking retains strong references.
 *
 * @param [name="ConstantType"] The display name; nullish uses the default, otherwise string-converted.
 * @param [propNames] Dense, unique field names in construction order; nullish means no fields.
 * @param [options] Own `validate`, `valueOf` and `trackInstances` options; inherited keys are ignored.
 * @param [options.validate] Synchronous hook called with a fresh instance as `this` before field creation.
 * Return an array to normalise arguments or `undefined` to retain them; throw to reject construction.
 * @param [options.valueOf] Declared field selector or method called with the instance as `this`.
 * @param [options.trackInstances=false] Whether to retain successful constructions for snapshots.
 * @returns A callable and newable record constructor with protected `name` and `getInstances` members.
 * @throws {TypeError} If the schema or own options are invalid, including async or generator validators.
 * @throws {Error} Propagates errors from reading configuration or converting the type name.
 * Alias of `Constant.defineType`.
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
 */
export declare const defineType: Constant.DefineType;
export type Value<T = unknown> = Constant.Value<T>;
export type Type<A extends readonly unknown[], I, T extends boolean | undefined = boolean | undefined> = Constant.Type<
  A,
  I,
  T
>;
