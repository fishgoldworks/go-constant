/**
 * Creates a fixed set of named constants with optional metadata, exact value
 * lookup and membership checks for string or finite-number values.
 * Pass a string as the second argument to give
 * the enum a descriptive name. The enum, its members and its member list are
 * shallowly frozen. The factory does not modify or freeze the caller's definitions.
 * Expanded members must be plain data objects at runtime. Spread a record to copy
 * its fields, or store the record in metadata to retain its identity and methods.
 */
declare function defineEnum<const D extends object>(
  definitions: D & defineEnum.ValidDefinitions<D>,
  name?: null
): defineEnum.Enum<D, null>;

/** Creates an enum with a read-only, non-enumerable name. Nullish names become null. */
declare function defineEnum<
  const D extends object,
  const Name extends string | null | undefined = string | null | undefined
>(definitions: D & defineEnum.ValidDefinitions<D>, name: Name): defineEnum.Enum<D, Name extends string ? Name : null>;

// Keep the optional parameter visible to utility types such as Parameters.
declare function defineEnum<const D extends object>(
  definitions: D & defineEnum.ValidDefinitions<D>,
  name?: string | null
): defineEnum.Enum<D>;

declare namespace defineEnum {
  type Value = string | number;
  type Definition = Value | { readonly value: Value };
  type ReservedName = 'name' | 'members' | 'fromValue' | 'hasValue';
  type UnsupportedObject =
    readonly unknown[] | ((...args: never[]) => unknown) | (abstract new (...args: never[]) => unknown);

  type ValidDefinitions<D> = D extends UnsupportedObject
    ? never
    : {
        [K in keyof D]: K extends ReservedName | symbol
          ? never
          : Extract<D[K], UnsupportedObject> extends never
            ? Definition
            : never;
      };

  type Member<D> = D extends Value ? { readonly value: D } : D extends { readonly value: Value } ? Readonly<D> : never;

  // Numeric enum types accept widened numbers. Open and branded types can also match more than one value.
  type LookupKey<V> = V extends Value
    ? `${V extends string ? 'string' : 'number'}:${number extends V ? string : {} extends Record<V, never> ? string : V}`
    : never;

  type MatchingMember<M, Input> = M extends { readonly value: infer Stored }
    ? [LookupKey<Stored> & LookupKey<Input>] extends [never]
      ? never
      : M
    : never;

  // Structural input types and erased void returns can hide a primitive value.
  type PossibleMember<M, Input> = Input extends Value
    ? MatchingMember<M, Input>
    : Input extends boolean | bigint | symbol | null | undefined
      ? never
      : M;

  interface Operations<M, Name extends string | null = string | null> {
    /** The enum's descriptive name, or null for an unnamed enum. */
    readonly name: Name;

    /** Frozen array of members in definition key order. Repeated reads return the same array. */
    readonly members: readonly M[];

    /** Returns the enum member for an exact stored value, or undefined. Known literals narrow the member type. */
    readonly fromValue: <const Input>(input: Input) => PossibleMember<M, Input> | undefined;

    /** Tests whether the input is a stored value. */
    readonly hasValue: (input: unknown) => boolean;
  }

  // Index signatures, including patterned strings, don't guarantee any particular name.
  type NamedMembers<D> = {
    readonly [K in keyof D as K extends ReservedName ? never : {} extends Record<K, never> ? never : K]: Member<D[K]>;
  };
  type Enum<D, Name extends string | null = string | null> = D extends unknown
    ? Operations<Member<D[keyof D]>, Name> & NamedMembers<D>
    : never;
}

export = defineEnum;
