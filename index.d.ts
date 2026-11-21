/** @packageDocumentation Go Constant 2.0 represents constants as objects with read-only values. */

import defineEnum = require('./defineEnum.js');

/** Type-only representation of the wrapper; not a constructor export. Private
 * identity and prototype methods are omitted from object-spread result types. */
declare abstract class ConstantValue<T = unknown> {
  private readonly constantIdentity: void;

  /**
   * The stored wrapper value, held by reference in an enumerable, read-only field.
   * Stored objects retain their original mutability.
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalue
   */
  readonly value: T;

  /**
   * The optional descriptive name, stored in a read-only field. Nullish input becomes `null`; other inputs are string-converted.
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancename
   */
  readonly name: string | null;

  /**
   * Returns the instance's value for explicit or automatic coercion.
   * @returns The stored wrapper value, without cloning or conversion.
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
   */
  valueOf(): T;
}

/** Prototype methods are omitted from object-spread result types. */
declare abstract class RecordCoercion<R> {
  /**
   * Returns the instance's value for explicit or automatic coercion.
   * @returns The selected field or callback result; without a configured method, ordinary object coercion returns the instance.
   * @throws {Error} Propagates errors from the configured callback.
   * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
   */
  valueOf(): R;
}

/**
 * Represents a constant as an object with a read-only `.value` field and an optional name.
 * A sole existing instance is reused by a factory call; `new` always creates a fresh wrapper.
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
 */
declare const Constant: Constant.Factory;

declare namespace Constant {
  type FieldKey = string | symbol;

  /** A wrapper, not an ordinary field copy. No class is exported at runtime. */
  type Value<T = unknown> = ConstantValue<T>;

  interface Factory {
    /** The same callable exposed as the named package-root export. */
    readonly Constant: Factory;

    /**
     * Creates a constant object with a read-only `.value` field.
     * The wrapper starts with `value: undefined` and `name: null`, and remains extensible.
     * @returns A new wrapper with `value: undefined` and `name: null`.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
     */
    (): Value<undefined>;

    /**
     * Represents a constant as an object with a read-only `.value` field.
     * A sole existing instance is reused; other calls create an extensible wrapper. Stored objects retain their original mutability.
     * @param value The value to retain by reference.
     * @returns The sole existing instance, or a new wrapper containing the supplied value.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
     */
    <T>(value: T): T extends Value<unknown> ? T : Value<T>;

    /**
     * Represents a constant as an object with a read-only `.value` field and an optional descriptive name.
     * Supplying the second argument always creates a fresh extensible wrapper. Stored objects retain their original mutability.
     * @param value The value to retain by reference.
     * @param name The name; nullish becomes `null`, otherwise `String(name)` is used.
     * @param extra Additional arguments, ignored when creating fields.
     * @returns A new wrapper containing the supplied value, even when that value is already a wrapper.
     * @throws {Error} Propagates errors from converting `name` to a string.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
     */
    <T>(value: T, name: unknown, ...extra: unknown[]): Value<T>;

    /**
     * Creates a fresh constant object with a read-only `.value` field.
     * The wrapper starts with `value: undefined` and `name: null`, and remains extensible.
     * @returns A new wrapper with `value: undefined` and `name: null`.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
     */
    new (): Value<undefined>;

    /**
     * Creates a fresh constant object with a read-only `.value` field and an optional name.
     * The wrapper remains extensible, and stored objects retain their original mutability.
     * @param value The value to retain by reference.
     * @param name The name; nullish becomes `null`, otherwise `String(name)` is used.
     * @param extra Additional arguments, ignored when creating fields.
     * @returns A fresh wrapper containing the supplied value.
     * @throws {Error} Propagates errors from converting `name` to a string.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantvalue-name
     */
    new <T>(value: T, name?: unknown, ...extra: unknown[]): Value<T>;

    /**
     * The read-only display name `"Constant"`.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantname
     */
    readonly name: string;

    /**
     * The prototype supplying instance identity and inherited methods. Custom members can be added.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantprototype
     */
    prototype: Value;

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
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    readonly defineType: DefineType;

    /** Defines a fixed set of named constants with exact lookup, membership checks and an optional enum name. */
    readonly defineEnum: typeof defineEnum;
  }

  /** Short tuples and general arrays may not supply every declared position. */
  type At<A extends readonly unknown[], I extends PropertyKey> = A extends unknown
    ? I extends keyof A
      ? A[I]
      : number extends A['length']
        ? A[number] | undefined
        : undefined
    : never;

  /** A union names alternatives, while an index pattern (string, symbol, or
   * an open template literal) does not name one guaranteed own property. */
  type IsUnion<K, Whole = K> = K extends Whole ? ([Whole] extends [K] ? false : true) : never;
  type FixedKey<K extends FieldKey> = true extends IsUnion<K> ? false : {} extends Record<K, never> ? false : true;
  type MatchingValues<K extends readonly FieldKey[], A extends readonly unknown[], P extends FieldKey> = {
    [I in keyof K]: [K[I] & P] extends [never] ? never : At<A, I>;
  }[number];
  type RequiredFields<K extends readonly FieldKey[], A extends readonly unknown[]> = {
    readonly [
      I in keyof K as I extends `${number}`
        ? K[I] extends FieldKey
          ? FixedKey<K[I]> extends true
            ? K[I]
            : never
          : never
        : never
    ]: At<A, I>;
  };
  type PossibleFields<K extends readonly FieldKey[], A extends readonly unknown[]> = {
    readonly [
      I in keyof K as I extends `${number}`
        ? K[I] extends FieldKey
          ? FixedKey<K[I]> extends false
            ? K[I]
            : never
          : never
        : never
    ]?: K[I] extends FieldKey ? MatchingValues<K, A, K[I]> : never;
  };

  /** Literal singleton keys remain required. Uncertain tuple keys are optional;
   * broad index domains include the values of overlapping fixed fields. */
  type Fields<K extends readonly FieldKey[], A extends readonly unknown[]> = number extends K['length']
    ? Readonly<Partial<Record<K[number], A[number]>>>
    : RequiredFields<K, A> & PossibleFields<K, A>;

  /** An array replaces inputs; undefined retains them. void erases the return
   * value and cannot establish whether runtime normalisation occurred. */
  type Normalized<A extends readonly unknown[], R extends readonly unknown[] | void> = R extends readonly unknown[]
    ? R
    : R extends undefined
      ? A
      : readonly unknown[];

  type AllowsCoercion<K extends readonly FieldKey[]> = number extends K['length']
    ? true
    : 'valueOf' extends K[number]
      ? false
      : true;
  type Coercion<K extends readonly FieldKey[], F> =
    AllowsCoercion<K> extends false ? null | undefined : K[number] | ((this: F) => unknown) | null | undefined;

  type Instance<F, S> = F &
    ('valueOf' extends keyof F
      ? {}
      : RecordCoercion<S extends (...args: never[]) => infer R ? R : S extends keyof F ? F[S] : unknown>);

  type Snapshot<I, T extends boolean | undefined> = [T] extends [false | undefined] ? never : I[];

  /** Generated callable constructor. Only input arguments are advertised:
   * structural output shapes cannot prove per-factory runtime identity. */
  interface Type<A extends readonly unknown[], I, T extends boolean | undefined = boolean | undefined> {
    /**
     * Creates a record with read-only fields in schema order.
     * A factory call with exactly one instance of this type reuses it without
     * validation or registration. `new` always initialises a fresh record.
     * The validator runs before field creation; tracking retains successful constructions.
     *
     * @param args Positional values, optionally normalised by the validator; missing fields receive `undefined`.
     * @returns The sole existing instance, or a new record with protected declared fields.
     * @throws {TypeError} If the validator returns neither an array nor `undefined`.
     * @throws {Error} Propagates validator and field-definition errors.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypeargs
     */
    (...args: A): I;

    /**
     * Creates a fresh record with read-only fields in schema order.
     * Construction always initialises a new extensible record, even for an existing instance argument.
     * The validator runs before field creation; tracking retains successful constructions.
     *
     * @param args Positional values, optionally normalised by the validator; missing fields receive `undefined`.
     * @returns A new record with protected declared fields.
     * @throws {TypeError} If the validator returns neither an array nor `undefined`.
     * @throws {Error} Propagates validator and field-definition errors.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypeargs
     */
    new (...args: A): I;

    /**
     * The read-only, string-converted display name of the generated constructor.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantname
     */
    readonly name: string;

    /**
     * The prototype supplying instance identity and inherited methods. Custom members can be added.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantprototype
     */
    prototype: I;

    /**
     * Returns a fresh snapshot of the tracked instances.
     * The mutable array contains the original objects in construction order.
     * Editing it does not change the registry, and later constructions do not update it.
     *
     * @returns A fresh shallow array of registered instances; reused instances are not added again.
     * @throws {Error} If `trackInstances` was not `true` when the type was defined.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
     */
    readonly getInstances: () => Snapshot<I, T>;
  }

  interface Options<
    K extends readonly FieldKey[],
    A extends readonly unknown[],
    R extends readonly unknown[] | void,
    S,
    T extends boolean | undefined
  > {
    /**
     * The optional synchronous hook invoked with a fresh instance as `this` before field creation.
     * Returns an array to normalise arguments or `undefined` to retain them. Throwing rejects construction.
     * Async/generator validators and other return values are rejected. Only an own option is used.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
     */
    validate?: ((this: Partial<Fields<K, readonly unknown[]>>, ...args: A) => R) | null | undefined;

    /**
     * The optional declared field selector or coercion callback, invoked with the instance as `this`.
     * Nullish disables custom coercion. Only an own option is used; a `valueOf` data field cannot coexist with a non-null option.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
     */
    valueOf?: S & Coercion<K, Fields<K, Normalized<A, R>>>;

    /**
     * Whether successful constructions are retained for snapshots. Defaults to `false`.
     * Only an own `true` enables tracking; the registry retains strong references and has no reset or removal method.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
     */
    trackInstances?: T;
  }

  /** Positional construction with explicit input types and ordinary options.
   * No normalisation: annotate a validator instead when output differs. */
  interface PositionalOptions<K extends readonly FieldKey[], A extends readonly unknown[]> {
    /**
     * No validator in this positional overload; values are assigned in schema order.
     * Use a validator overload when inputs need validation or normalisation.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
     */
    validate?: null | undefined;

    /**
     * The optional declared field selector or coercion callback, invoked with the instance as `this`.
     * Nullish disables custom coercion. Only an own option is used; a `valueOf` data field cannot coexist with a non-null option.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
     */
    valueOf?: Coercion<K, Fields<K, A>>;

    /**
     * Whether successful constructions are retained for snapshots. Defaults to `false`.
     * Only an own `true` enables tracking; the registry retains strong references and has no reset or removal method.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
     */
    trackInstances?: boolean | undefined;
  }

  /** A captured options shape must not hide unsupported configuration keys. */
  type KnownOptions<O> = O extends null | undefined
    ? O
    : Record<Exclude<keyof O, 'validate' | 'valueOf' | 'trackInstances'>, never>;

  /** Preserve optional flags instead of treating their value type as presence. */
  type Saved<O> = O extends { trackInstances?: infer T }
    ? Extract<T, boolean | undefined> | (O extends { trackInstances: unknown } ? never : undefined)
    : undefined;
  type ActualResult<A extends readonly unknown[], R extends readonly unknown[] | void, O> = O extends {
    validate: (...args: never[]) => unknown;
  }
    ? Normalized<A, R>
    : Normalized<A, R | undefined>;
  type Selector<O> = O extends { valueOf?: infer S } ? (O extends { valueOf: unknown } ? S : S | undefined) : undefined;

  interface DefineType {
    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload declares a data field named `valueOf`. Validation is optional; a coercion
     * method cannot be configured alongside that field.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order. Must
     * include `"valueOf"`.
     * @param options Own validation and tracking options, or `null`/`undefined`.
     * @param [options.validate] Synchronous hook called with a fresh instance as `this` before
     * field creation. Return an array to normalise arguments or `undefined` to retain them;
     * throw to reject construction.
     * @param [options.valueOf] Only `null` or `undefined` is accepted because `valueOf` is a
     * data field.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including async/generator
     * validators or non-null custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <
      const K extends readonly FieldKey[],
      A extends readonly unknown[] = readonly unknown[],
      const R extends readonly unknown[] | void = undefined,
      T extends boolean | undefined = undefined,
      const O = unknown
    >(
      name: unknown,
      propNames: K & ('valueOf' extends K[number] ? unknown : never),
      options: O &
        KnownOptions<O> &
        (
          | {
              /**
               * Synchronous hook called with a fresh instance as `this` before field creation.
               * Return an array to normalise arguments or `undefined` to retain them; throw to
               * reject construction.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
               */
              validate?: ((this: Partial<Fields<K, readonly unknown[]>>, ...args: A) => R) | null | undefined;

              /**
               * Whether successful constructions are retained for snapshots. Defaults to `false`.
               * The registry keeps strong references and has no reset or removal method.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
               */
              trackInstances?: T;
            }
          | null
          | undefined
        ) &
        ('valueOf' extends keyof O
          ? {
              /**
               * Only `null` or `undefined` is accepted because this schema declares a `valueOf`
               * data field.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
               */
              valueOf?: null | undefined;
            }
          : unknown)
    ): Type<A, Fields<K, ActualResult<A, R, O>>, Saved<O>>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload requires a validator and a coercion callback. The callback receives the
     * normalised record fields as `this`.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own validator, coercion callback and optional tracking settings.
     * @param options.validate Synchronous hook called with a fresh instance as `this` before
     * field creation. Return an array to normalise arguments or `undefined` to retain them;
     * throw to reject construction.
     * @param options.valueOf Coercion callback called with the completed instance as `this`;
     * its result need not be a primitive.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including async/generator
     * validators or a `valueOf` data field combined with custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <
      const K extends readonly FieldKey[],
      A extends readonly unknown[],
      const R extends readonly unknown[] | void,
      V,
      T extends boolean | undefined = undefined,
      const O = unknown
    >(
      name: unknown,
      propNames: K,
      options: O &
        KnownOptions<O> & {
          /**
           * Synchronous hook called with a fresh instance as `this` before field creation.
           * Return an array to normalise arguments or `undefined` to retain them; throw to
           * reject construction.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
           */
          validate: (this: Partial<Fields<K, readonly unknown[]>>, ...args: A) => R;

          /**
           * Coercion callback called with the completed instance as `this`; its result need
           * not be a primitive.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
           */
          valueOf: ((this: NoInfer<Fields<K, Normalized<A, R>>>) => V) &
            (AllowsCoercion<K> extends false ? never : unknown);

          /**
           * Whether successful constructions are retained for snapshots. Defaults to `false`.
           * The registry keeps strong references and has no reset or removal method.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
           */
          trackInstances?: T;
        } & ThisType<NoInfer<Fields<K, Normalized<A, R>>>>
    ): Type<A, Instance<Fields<K, Normalized<A, R>>, () => V>, Saved<O>>;
    // An optional normaliser may be skipped, including for the coercion receiver.

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload combines an optional validator with a required coercion callback. Without a
     * validator, the constructor keeps the supplied arguments.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own optional validator, required coercion callback and optional tracking
     * settings.
     * @param [options.validate] Synchronous hook called with a fresh instance as `this` before
     * field creation. Return an array to normalise arguments or `undefined` to retain them;
     * throw to reject construction.
     * @param options.valueOf Coercion callback called with the completed instance as `this`;
     * its result need not be a primitive.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including async/generator
     * validators or a `valueOf` data field combined with custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <
      const K extends readonly FieldKey[],
      A extends readonly unknown[],
      const R extends readonly unknown[] | void,
      V,
      T extends boolean | undefined = undefined,
      const O = unknown
    >(
      name: unknown,
      propNames: K,
      options: O &
        KnownOptions<O> & {
          /**
           * Synchronous hook called with a fresh instance as `this` before field creation.
           * Return an array to normalise arguments or `undefined` to retain them; throw to
           * reject construction.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
           */
          validate?: ((this: Partial<Fields<K, readonly unknown[]>>, ...args: A) => R) | null | undefined;

          /**
           * Coercion callback called with the completed instance as `this`; its result need
           * not be a primitive.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
           */
          valueOf: ((this: NoInfer<Fields<K, Normalized<A, R | undefined>>>) => V) &
            (AllowsCoercion<K> extends false ? never : unknown);

          /**
           * Whether successful constructions are retained for snapshots. Defaults to `false`.
           * The registry keeps strong references and has no reset or removal method.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
           */
          trackInstances?: T;
        } & ThisType<NoInfer<Fields<K, Normalized<A, R | undefined>>>>
    ): Type<A, Instance<Fields<K, Normalized<A, R | undefined>>, () => V>, Saved<O>>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload assigns positional inputs without validation or normalisation and requires
     * a coercion callback.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own coercion callback and optional tracking settings.
     * @param [options.validate] Only `null` or `undefined` is accepted; use a validator
     * overload to normalise inputs.
     * @param options.valueOf Coercion callback called with the completed instance as `this`;
     * its result need not be a primitive.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including a `valueOf` data
     * field combined with custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <
      const K extends readonly FieldKey[],
      A extends readonly unknown[] = readonly unknown[],
      V = unknown,
      T extends boolean | undefined = undefined,
      const O = unknown
    >(
      name: unknown,
      propNames: K,
      options: O &
        KnownOptions<O> & {
          /**
           * Only `null` or `undefined` is accepted in this overload; no validation or
           * normalisation occurs.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
           */
          validate?: null | undefined;

          /**
           * Coercion callback called with the completed instance as `this`; its result need
           * not be a primitive.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
           */
          valueOf: ((this: Fields<K, A>) => V) & (AllowsCoercion<K> extends false ? never : unknown);

          /**
           * Whether successful constructions are retained for snapshots. Defaults to `false`.
           * The registry keeps strong references and has no reset or removal method.
           * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
           */
          trackInstances?: T;
        } & ThisType<Fields<K, A>>
    ): Type<A, Instance<Fields<K, A>, () => V>, Saved<O>>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * Validation, coercion and tracking are optional. The schema and own options are captured
     * once; later changes to the option object do not reconfigure the type.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own `validate`, `valueOf` and `trackInstances` options; inherited keys are
     * ignored. May be `null` or `undefined`.
     * @param [options.validate] Synchronous hook called with a fresh instance as `this` before
     * field creation. Return an array to normalise arguments or `undefined` to retain them;
     * throw to reject construction.
     * @param [options.valueOf] A declared field selector or coercion callback; `null` or
     * `undefined` disables custom coercion.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or own options are invalid, including async/generator
     * validators.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <
      const K extends readonly FieldKey[] = readonly [],
      A extends readonly unknown[] = readonly unknown[],
      const R extends readonly unknown[] | void = undefined,
      S = undefined,
      T extends boolean | undefined = undefined,
      const O = unknown
    >(
      name: unknown,
      propNames: K,
      options: O &
        KnownOptions<O> &
        ((Options<K, A, R, S, T> & ThisType<Fields<K, ActualResult<A, R, O>>>) | null | undefined)
    ): Type<A, Instance<Fields<K, ActualResult<A, R, O>>, Selector<O>>, Saved<O>>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload assigns positional values to the declared fields. No validator, coercion
     * method or instance tracking is configured.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema is invalid, including duplicate, sparse or unsupported
     * field names.
     * @throws {Error} Propagates errors from converting the type name or reading the schema.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <const K extends readonly FieldKey[], A extends readonly unknown[] = readonly unknown[]>(
      name: unknown,
      propNames: K
    ): Type<A, Instance<Fields<K, A>, undefined>, undefined>;
    // Explicit positional data-field schemas must not inherit an option-object
    // valueOf requirement. An explicit null option uses the ordinary overload.

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This positional overload declares a `valueOf` data field and enables instance tracking.
     * It has no validator or custom coercion method.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order. Must
     * include `"valueOf"`.
     * @param options Own tracking settings; a `valueOf` option is not accepted by this
     * overload.
     * @param [options.validate] Only `null` or `undefined` is accepted; inputs are assigned
     * without normalisation.
     * @param options.trackInstances Must be `true`. Retains successful constructions for
     * snapshots, keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <const K extends readonly FieldKey[], A extends readonly unknown[]>(
      name: unknown,
      propNames: K & ('valueOf' extends K[number] ? unknown : never),
      options: Omit<PositionalOptions<K, A>, 'valueOf'> & {
        /**
         * Must be `true` in this overload. Retains successful constructions for snapshots,
         * keeping strong references with no reset or removal method.
         * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
         */
        trackInstances: true;
      }
    ): Type<A, Fields<K, A>, true>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This positional overload declares a `valueOf` data field, with optional instance
     * tracking. It has no validator or custom coercion method.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order. Must
     * include `"valueOf"`.
     * @param options Own tracking settings; a `valueOf` option is not accepted by this
     * overload.
     * @param [options.validate] Only `null` or `undefined` is accepted; inputs are assigned
     * without normalisation.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <const K extends readonly FieldKey[], A extends readonly unknown[]>(
      name: unknown,
      propNames: K & ('valueOf' extends K[number] ? unknown : never),
      options: Omit<PositionalOptions<K, A>, 'valueOf'>
    ): Type<A, Fields<K, A>, boolean | undefined>;
    // Two explicit type arguments leave no parameter available for inferring
    // a selector/callback result. Keep fields precise and coercion unknown.

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This positional overload enables instance tracking without validation or normalisation.
     * Custom coercion is optional.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own coercion and tracking settings.
     * @param [options.validate] Only `null` or `undefined` is accepted; inputs are assigned
     * without normalisation.
     * @param [options.valueOf] A declared field selector or coercion callback; `null` or
     * `undefined` disables custom coercion.
     * @param options.trackInstances Must be `true`. Retains successful constructions for
     * snapshots, keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including a `valueOf` data
     * field combined with custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <const K extends readonly FieldKey[], A extends readonly unknown[]>(
      name: unknown,
      propNames: K,
      options: PositionalOptions<K, A> & {
        /**
         * Must be `true` in this overload. Retains successful constructions for snapshots,
         * keeping strong references with no reset or removal method.
         * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
         */
        trackInstances: true;
      }
    ): Type<A, Instance<Fields<K, A>, unknown>, true>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This positional overload assigns inputs without validation or normalisation. Custom
     * coercion and instance tracking are optional.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames Dense, unique string or symbol field names in construction order.
     * @param options Own coercion and tracking settings.
     * @param [options.validate] Only `null` or `undefined` is accepted; inputs are assigned
     * without normalisation.
     * @param [options.valueOf] A declared field selector or coercion callback; `null` or
     * `undefined` disables custom coercion.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the schema or options are invalid, including a `valueOf` data
     * field combined with custom coercion.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <const K extends readonly FieldKey[], A extends readonly unknown[]>(
      name: unknown,
      propNames: K,
      options: PositionalOptions<K, A>
    ): Type<A, Instance<Fields<K, A>, unknown>, boolean | undefined>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload declares no fields. Validation, a coercion callback and instance tracking
     * are optional; there is no field for a coercion selector to select.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param name The display name; `null` or `undefined` uses `"ConstantType"`, otherwise
     * string-converted.
     * @param propNames `null` or `undefined` to declare no fields.
     * @param options Own validator, coercion callback and tracking settings, or
     * `null`/`undefined`.
     * @param [options.validate] Synchronous hook called with a fresh instance as `this` before
     * field creation. Return an array to normalise arguments or `undefined` to retain them;
     * throw to reject construction.
     * @param [options.valueOf] Coercion callback called with the completed instance as `this`;
     * its result need not be a primitive. Omission, `null` or `undefined` disables custom
     * coercion.
     * @param [options.trackInstances=false] Retains successful constructions for snapshots,
     * keeping strong references with no reset or removal method.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {TypeError} If the options are invalid, including async/generator validators or a
     * field-name coercion selector.
     * @throws {Error} Propagates errors from converting the type name or reading the schema and
     * options.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    <T extends boolean | undefined = undefined, const O = unknown, A extends readonly unknown[] = readonly unknown[]>(
      name: unknown,
      propNames: null | undefined,
      options: O &
        KnownOptions<O> &
        (
          | {
              /**
               * Synchronous hook called with a fresh instance as `this` before field creation.
               * Return an array to normalise arguments or `undefined` to retain them; throw to
               * reject construction.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#validation-and-normalisation
               */
              validate?: ((this: object, ...args: A) => readonly unknown[] | void) | null | undefined;

              /**
               * Coercion callback called with the completed instance as `this`; its result need
               * not be a primitive.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#instancevalueof
               */
              valueOf?: ((this: object) => unknown) | null | undefined;

              /**
               * Whether successful constructions are retained for snapshots. Defaults to `false`.
               * The registry keeps strong references and has no reset or removal method.
               * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#mytypegetinstances
               */
              trackInstances?: T;
            }
          | null
          | undefined
        )
    ): Type<A, Instance<{}, Selector<O>>, Saved<O>>;

    /**
     * Creates a reusable constructor for records with read-only declared fields.
     * This overload declares no fields and configures no validator, coercion method or instance
     * tracking.
     * Call the returned constructor with or without `new`. New records are extensible, and
     * referenced values retain their original mutability.
     *
     * @param [name="ConstantType"] The display name; `null` or `undefined` uses
     * `"ConstantType"`, otherwise string-converted.
     * @param [propNames] Omit or pass `null` or `undefined` to declare no fields.
     * @returns A callable and newable record constructor with protected `name` and
     * `getInstances` members.
     * @throws {Error} Propagates errors from converting the type name.
     * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#constantdefinetypename-fields-options
     */
    (name?: unknown, propNames?: null): Type<unknown[], Instance<{}, undefined>, undefined>;
  }
}

export = Constant;
export as namespace goConstant;
