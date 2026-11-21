# Go Constant API reference

[← Back to README](../README.md)

[Version {{VERSION}}](../CHANGELOG.md)

Full signatures, parameters, return values, errors, examples and behavioural contracts. See the [README](../README.md) for installation, usage and development.

Examples that omit import statements assume [`Constant`](#constantvalue-name) has been imported from `go-constant`.

The summary links every public constructor, callable, method, and documented property. Factory and `new` forms share an entry because they accept the same parameters; their identity rules are noted separately. `?` marks an optional argument. **—** means no explicit default is supplied.

## Contents

{{TOC}}

## API summary

[Creation](#creation) · [Enum lookup](#enum-lookup) · [Snapshots and coercion](#snapshots-and-coercion) · [Properties](#properties)

> Notation: MyType is a generated constructor, MyEnum is an enum, and myMember is one of its members.

### Creation

<!-- prettier-ignore -->
| API | Description | Returns |
| --- | --- | --- |
| [`Constant(value?, name?)`](#constantvalue-name) | Represents a constant as an object you can pass around. It stores the value in a read-only [`.value`](#instancevalue) field and accepts an optional display name. Passing an existing [`Constant`](#constantvalue-name) instance as the sole argument returns that same instance. | **[`Constant.Value<T>`](#instance-identity-and-typing-limitations)**<br><br>If the only argument is an existing [`Constant`](#constantvalue-name) instance, returns that instance. Otherwise, returns a new one. |
| [`new Constant(value?, name?)`](#constantvalue-name) | Creates a fresh constant object with a read-only [`.value`](#instancevalue) field and an optional display name. | **[`Constant.Value<T>`](#instance-identity-and-typing-limitations)**<br><br>A new wrapper storing the supplied value by reference. |
| [`defineType(name?, fields?, options?)`](#definetypename-fields-options) | Creates a reusable constructor for records with read-only declared fields.<br><br>Also available as [`Constant.defineType()`](#constantdefinetype). | **`Function`** — `(...args) => I`<br><br>A record constructor you can call with or without `new`. Its [`name`](#constantname) and [`getInstances`](#mytypegetinstances) properties are read-only. |
| [`MyType(...args)`](#mytypeargs) | Creates a record by matching arguments to the read-only fields in the order you listed them. If the only argument is an existing instance of the same type, returns that instance. | **`I`**<br><br>The existing instance when it is the sole argument; otherwise a new instance with protected declared fields. |
| [`new MyType(...args)`](#mytypeargs) | Always creates a fresh record, matching arguments to the read-only fields in the order you listed them. | **`I`**<br><br>A new instance of the generated type, with protected declared fields. |
| [`defineEnum(definitions, name?)`](#defineenumdefinitions-name) | Creates a fixed set of named constants with optional member metadata and an optional enum name.<br><br>Also available as [`Constant.defineEnum()`](#defineenumdefinitions-name) on the CommonJS root and [`goConstant.defineEnum()`](#defineenumdefinitions-name) in browser scripts. | **`object`**<br><br>A frozen enum with named members, exact value lookup and membership checks. |

### Enum lookup

<!-- prettier-ignore -->
| API | Description | Returns |
| --- | --- | --- |
| [`MyEnum.fromValue(input)`](#myenumfromvalueinput) | Looks up a member by its stored value. | **`object \| undefined`**<br><br>The same member you can read by [its definition key](#myenumkey), or `undefined` if no stored value matches exactly. For example, `Status.fromValue("draft")` returns `Status.DRAFT`. |
| [`MyEnum.hasValue(input)`](#myenumhasvalueinput) | Checks whether a stored value is present. For example, `Status.hasValue("draft")` checks for `"draft"`, while `Status.hasValue(Status.DRAFT)` returns `false`. | **`boolean`**<br><br>`true` if the input matches a stored value exactly. |

### Snapshots and coercion

<!-- prettier-ignore -->
| API | Description | Returns |
| --- | --- | --- |
| [`MyType.getInstances()`](#mytypegetinstances) | Returns a new array containing the original tracked records in registration order. Editing the array leaves the tracked list intact. Requires `trackInstances: true`. | **`I[]`**<br><br>An array of tracked instances. |
| [`instance.valueOf()`](#instancevalueof) | Returns the instance's value for explicit or automatic coercion. | **`T \| I`**<br><br>The stored wrapper value, the configured coercion result, or the generated instance when it uses the inherited `Object.prototype.valueOf()` method. |

### Properties

<!-- prettier-ignore -->
| API | Description |
| --- | --- |
| [`instance.value`](#instancevalue) | The stored value, held by reference in a read-only field. |
| [`instance.name`](#instancename) | The optional, read-only display name as a string, or `null` for nullish input. |
| [`Constant.name`](#constantname) | The default constructor's read-only name. |
| [`Constant.prototype`](#constantprototype) | The prototype shared by [`Constant`](#constantvalue-name) instances, providing their [`valueOf()`](#instancevalueof) method. |
| [`Constant.defineType`](#constantdefinetype) | The same function as [`defineType()`](#definetypename-fields-options), exposed as a read-only property. |
| [`MyType.name`](#constantname) | The generated constructor's read-only name, taken from its type definition. |
| [`MyType.prototype`](#constantprototype) | The generated type's instance prototype, which defines [`valueOf()`](#instancevalueof) when coercion is configured. |
| [`MyEnum[key]`](#myenumkey) | The read-only member for a key supplied in the enum definition. |
| [`MyEnum.members`](#myenummembers) | A frozen array of the enum's members in definition key order. Repeated reads return the same array. |
| [`MyEnum.name`](#myenumname) | The read-only, non-enumerable enum name as a string, or `null` for an unnamed enum. |
| [`myMember.value`](#mymembervalue) | The member's read-only stored string or finite number. |

`T` is the stored or configured coercion value type. `I` is an instance of a generated type. Returned constructors support both [`MyType(...args)`](#mytypeargs) and [`new MyType(...args)`](#mytypeargs). See the [TypeScript reference](#typescript) for option-dependent types.

## Constructors and methods

### `Constant(value?, name?)`

Represents a constant as an object with a read-only [`.value`](#instancevalue) field. The optional display name is stored in a read-only [`.name`](#instancename) field. Referenced objects retain their original mutability. New wrappers are extensible. A factory call with exactly one existing [`Constant`](#constantvalue-name) returns that instance. Extra arguments do not become fields.

The named and default root exports and the focused `go-constant/Constant` entry all refer to the same callable. CommonJS callers can also destructure the named [`Constant`](#constantvalue-name) property from the root export.

In browser and worker scripts, [`goConstant`](#constantvalue-name) and [`goConstant.Constant`](#constantvalue-name) call the same function.

**Construction:** [`new Constant(value?, name?)`](#constantvalue-name) uses the same parameters and always creates a fresh wrapper.

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `value?` | `unknown` | `undefined` | Stored by reference without cloning or freezing. |
| `name?` | `unknown` | `null` | Optional display name. Nullish values become `null`; other values pass through `String(name)`. |

**Returns:** [`Constant.Value<T>`](#instance-identity-and-typing-limitations) — the sole existing instance for a factory reuse call; otherwise a new extensible wrapper storing `value` by reference. `new` always creates a fresh wrapper.

**Errors:** User-defined conversion in `String(name)` can throw; its exception propagates.

**Examples**

<!-- prettier-ignore -->
```javascript
const red = Constant("#FF0000", "Red");
red.value;                                  // => "#FF0000"
red.name;                                   // => "Red"
Reflect.set(red, "value", "#0000FF");       // => false
Constant(red) === red;                      // => true
new Constant(red) === red;                  // => false
```

**Notes:** The default type has no instance tracking. Since 1.0.0.

---

<a name="constantdefinetypename-fields-options"></a>

### `defineType(name?, fields?, options?)`

Creates a reusable constructor for records with read-only declared fields. Call the returned function with or without `new` to create records. The named ES module export and destructured CommonJS member are the same function.

Also available as [`Constant.defineType()`](#constantdefinetype) on the callable export and [`goConstant.defineType()`](#definetypename-fields-options) in browser scripts.

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `name?` | `unknown` | `'ConstantType'` | Display name, string-converted once; nullish uses the default. |
| `fields?` | Dense array of unique strings or symbols, or nullish | `[]` | Declared field names in construction order; numeric keys must be strings. |
| `options?` | Non-array object or nullish | No options | Only own `validate`, `valueOf`, and `trackInstances` keys are accepted. Inherited keys are ignored. |
| `options.validate?` | Synchronous function or nullish | None | Receives positional arguments with a fresh instance as `this`, before field creation; returns an array to normalise or `undefined` to retain arguments. |
| `options.valueOf?` | Declared field key, function, or nullish | None | Selects a field or defines a coercion method. |
| `options.trackInstances?` | `boolean` | `false` | Set to `true` to retain this type’s records in memory. Read a fresh snapshot with [`MyType.getInstances()`](#mytypegetinstances). |

**Returns:** `Function` — `(...args) => I`. A record constructor that also supports [`new MyType(...args)`](#mytypeargs), with read-only [`name`](#constantname) and [`getInstances`](#mytypegetinstances) properties. Its TypeScript type is [`Constant.Type`](#mytypeargs).

**Errors:** Invalid schema, options, selectors, or callback types throw `TypeError` at definition. Unknown own option keys, including symbols and non-enumerable keys, are rejected before any option accessor is evaluated. Arrays and non-object options are rejected; inherited keys are ignored. User conversion and accessor errors propagate. Native async and generator validators are rejected when their kind can be identified at definition time.

An own [`saveInstances`](migration.md#replace-mutable-registry-access-with-snapshots) key throws `TypeError` with the replacement name. See [the 1.x tracking migration](migration.md#replace-mutable-registry-access-with-snapshots).

**Examples**

<!-- prettier-ignore -->
```javascript
import { defineType } from "go-constant";

const Priority = defineType("Priority", ["code", "rank"]);

const normal = Priority("normal", 20);
const high = Priority("high", 30);

normal.code;   // => "normal"
normal.rank;   // => 20
high.code;     // => "high"
high.rank;     // => 30
```

**Notes:** Schema keys and option values are captured at definition; callback closure state is not frozen. Missing positions become `undefined`; validators can enforce required fields. A declared field named [`valueOf`](#a-data-field-named-valueof) cannot coexist with a non-null coercion option. A tracking registry has no removal/reset method and retains strong references, so it suits small definition sets. See [Validation and normalisation](#validation-and-normalisation). For the former [`newType()`](migration.md#rename-the-record-type-factory) API, see [how to update calls and imports](migration.md#rename-the-record-type-factory).

---

### `MyType(...args)`

Creates a record by matching arguments to the read-only fields in the order you listed them. If the only argument is an existing instance of the same type, the factory returns that instance.

**Construction:** [`new MyType(...args)`](#mytypeargs) uses the same arguments and always creates a fresh record.

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Description |
| --- | --- | --- |
| `...args` | `unknown[]` | Values assigned by schema order, or normalised by `options.validate`. Missing field positions receive `undefined`. |

**Returns:** `I` — the sole existing instance of this type for a factory reuse call; otherwise a new extensible record with protected declared fields. `new` always creates a fresh record.

**Errors:** Validator errors propagate. Invalid validator return values throw `TypeError`; field definition failures propagate.

**Examples**

<!-- prettier-ignore -->
```javascript
const Item = Constant.defineType('Item', ['code']);
const item = Item('A');
item.code;                     // => 'A'
Item(item) === item;           // => true
new Item(item) === item;       // => false
```

**Notes:** Successful base construction is registered when tracking is enabled; reuse of an existing object through the factory does not append it again. Factory calls with `.call()` or `.apply()` do not initialise or mutate the supplied receiver. A derived constructor may still throw after `super()` has registered it. Since 1.1.0 for custom types.

---

### `defineEnum(definitions, name?)`

Creates a fixed set of named constants with value lookup and membership checks. The definition keys name the members. Each member is a plain object with a read-only [`.value`](#mymembervalue) field and any metadata supplied in the definition. Pass an optional string as the second argument to identify the enum in diagnostics or generic helpers.

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `definitions` | Non-array object | — | Own enumerable data properties map names to strings, finite numbers or plain data objects with an own enumerable `value` data property of one of those types. |
| `name?` | `string \| null \| undefined` | `null` | A descriptive enum name. Omitted, `null` and `undefined` names become `null`. |

An empty object creates an enum with no members. The factory reads own enumerable string data properties, including numeric keys as strings. It ignores inherited properties and rejects own symbols, non-enumerable properties and accessors. These rules apply to the definition table and to expanded member definitions.

An expanded member uses a plain object, such as an object literal or an object created with no prototype. Object literals from another JavaScript realm work with that realm’s standard object prototype. Pass the fields of a class instance or a generated record in a plain object.

The factory makes shallow copies. It freezes the returned enum object, each member and the member array without modifying or freezing the input objects. Nested values and functions keep their identity and original mutability. The factory does not call or bind metadata functions. Later JavaScript operations may invoke function-valued `toJSON`, `toString` or `valueOf` metadata during serialisation or coercion.

Spread a [`defineType()`](#definetypename-fields-options) record to copy its fields, or select the fields you want to include. Supply a string or finite number as the member’s [`.value`](#mymembervalue). To preserve the original instance and its methods, store it in a metadata field. See [record identity and freezing](#enum-records-identity-and-freezing) for examples, or [Build an enum from records](../README.md#build-an-enum-from-records) for a lookup example.

**Returns** a frozen enum object with named members and the non-enumerable [`name`](#myenumname), [`members`](#myenummembers), [`fromValue`](#myenumfromvalueinput) and [`hasValue`](#myenumhasvalueinput) properties. Each call creates independent member objects, even when enum names match. The CommonJS root exposes the same factory as [`Constant.defineEnum()`](#defineenumdefinitions-name), and browser scripts can call [`goConstant.defineEnum()`](#defineenumdefinitions-name).

**Errors**

- `TypeError` for malformed definitions or a name other than a string, `null` or `undefined`.
- `TypeError` for an expanded member with a custom prototype, including a class instance or a generated record passed directly.
- `TypeError` for the exact top-level keys [`name`](#myenumname), [`members`](#myenummembers), [`fromValue`](#myenumfromvalueinput) and [`hasValue`](#myenumhasvalueinput). Members can use `name` as a metadata field and `"name"` as a stored value.
- `TypeError` for duplicate stored values. The message identifies both member keys and includes the enum name when supplied. Numeric `0` and string `"0"` are distinct. Numeric `-0` and `0` count as duplicates.

**Examples**

<!-- prettier-ignore -->
```javascript
import defineEnum from "go-constant/defineEnum";

const Priority = defineEnum({ LOW: 0, NORMAL: 10, HIGH: 20 }, "Priority");
Priority.name;                           // => "Priority"
Priority.fromValue(0) === Priority.LOW;  // => true
Priority.hasValue("0");                  // => false
defineEnum({ A: 1, B: 1 });              // => throws TypeError
```

---

### `MyEnum.fromValue(input)`

Returns the same member you can read by [its definition key](#myenumkey), or `undefined` if no stored value matches exactly. For example, `Status.fromValue("draft")` returns `Status.DRAFT` when its stored value is `"draft"`. The lookup uses `Map` key equality with no trimming, case folding or conversion.

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `unknown` | The stored value to look up. Any input is accepted without conversion. |

**Returns:** `object | undefined` — the original enum member whose stored value matches the input, or `undefined` if no member matches.

**Examples**

<!-- prettier-ignore -->
```javascript
import { defineEnum } from "go-constant";

const Status = defineEnum({ DRAFT: "draft", PUBLISHED: "published" });

Status.fromValue("draft") === Status.DRAFT;  // => true
Status.fromValue("DRAFT");                   // => undefined
Status.fromValue(Status.DRAFT);              // => undefined
```

**Notes**

In TypeScript, a literal input to [`fromValue()`](#myenumfromvalueinput) narrows the possible member types. If only the `PUBLISHED` member has a `label`, `Status.fromValue("published")?.label` can read it directly. An `unknown` input can match any member.

---

### `MyEnum.hasValue(input)`

Checks whether a stored value is present. For example, `Status.hasValue("draft")` returns `true` when `"draft"` is stored, while `Status.hasValue(Status.DRAFT)` returns `false`. To retrieve the matching member instead, use [`fromValue()`](#myenumfromvalueinput).

**Parameters**

<!-- prettier-ignore -->
| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `unknown` | The value to check against stored values, without conversion. |

**Returns:** `boolean` — `true` if the input matches a stored value exactly; otherwise `false`.

**Examples**

<!-- prettier-ignore -->
```javascript
import { defineEnum } from "go-constant";

const Status = defineEnum({ DRAFT: "draft", PUBLISHED: "published" });

Status.hasValue("draft");        // => true
Status.hasValue("DRAFT");        // => false
Status.hasValue(Status.DRAFT);   // => false
```

---

### `MyType.getInstances()`

Returns a new array of tracked instances that you can list or sort. Set `trackInstances: true` when calling [`defineType()`](#definetypename-fields-options) to enable tracking.

**Parameters**

No parameters.

**Returns:** `I[]` — a fresh mutable array of the original instances in registration order, or an empty array when tracking is enabled but no instances have been registered. Each instance is registered after its fields are initialised. Reusing an instance through the factory skips registration.

**Errors:** Throws a plain `Error` when [`trackInstances`](#definetypename-fields-options) was not `true` at type definition. The message names the type and explains how to enable tracking when defining it.

**Examples**

<!-- prettier-ignore -->
```javascript
const Item = Constant.defineType('Item', ['code'], { trackInstances: true });
Item('A');
const snapshot = Item.getInstances();
snapshot.length = 0;
Item.getInstances().length;    // => 1

const Untracked = Constant.defineType('Untracked', ['code']);
Untracked('A');
Untracked.getInstances();      // => throws Error
```

**Notes:** Editing a snapshot leaves the registry intact. Call [`getInstances()`](#mytypegetinstances) again to include later registrations. The protected method is non-enumerable, non-writable, and non-configurable. Tracking retains strong references while the type remains reachable. Since 2.0.0.

---

### `instance.valueOf()`

Returns the instance's value for explicit or automatic coercion. For a default wrapper, it reads the stored [`value`](#instancevalue). For a generated record, [`options.valueOf`](#definetypename-fields-options) can select a field or supply a callback invoked with the instance as `this`.

**Parameters**

No parameters.

**Returns:** `T | I` — the stored wrapper value, selected field or callback result (`T`). An inherited `Object.prototype.valueOf()` returns the record itself (`I`). A configured result can be a primitive or an object.

**Errors:** A configured callback's exception propagates.

**Examples**

<!-- prettier-ignore -->
```javascript
Constant(7).valueOf();         // => 7

const Level = Constant.defineType("Level", ["rank"], { valueOf: "rank" });
Level(30).valueOf();           // => 30
```

**Notes:** A generated type installs a method when [`options.valueOf`](#definetypename-fields-options) is configured. A declared [`valueOf` data field](#a-data-field-named-valueof) shadows the inherited method. No automatic `toString`, `toJSON`, or `Symbol.toPrimitive` is added.

## Property reference

### `instance.value`

`value` is an own, enumerable, non-writable, non-configurable field on a default wrapper. Generated instances expose their declared schema fields with the same descriptors; each field's value is whatever was supplied or normalised. Referenced values retain their original mutability.

---

### `instance.name`

A default wrapper's optional display name. It is an own, enumerable, non-writable and non-configurable field containing a string or `null`. A generated record has its own `name` field when its schema declares one.

---

### `Constant.name`

[`Constant.name`](#constantname) is `'Constant'`. A generated constructor's [`MyType.name`](#constantname) is the name supplied to [`defineType()`](#definetypename-fields-options), converted to a string; a nullish name defaults to `'ConstantType'`. Both name properties are read-only and non-configurable.

---

### `Constant.prototype`

[`Constant.prototype`](#constantprototype) is the prototype shared by [`Constant`](#constantvalue-name) instances and defines their [`valueOf()`](#instancevalueof) method. Each generated constructor has its own prototype, which defines [`valueOf()`](#instancevalueof) when coercion is configured and otherwise inherits `Object.prototype.valueOf()`. Declared fields are initialized on individual instances. Add methods to a prototype to share them across its instances.

---

### `Constant.defineType`

The enumerable, non-writable, non-configurable [`Constant.defineType`](#constantdefinetype) property is the [`defineType`](#definetypename-fields-options) function. It is also available as an ES module named export.

---

### `MyEnum[key]`

Each key in the enum definition becomes a read-only own property. For example, if you define `DRAFT`, `Status.DRAFT` and `Status["DRAFT"]` access the same member object.

That same object appears in [`MyEnum.members`](#myenummembers). To look it up by its [stored value](#mymembervalue), use [`fromValue()`](#myenumfromvalueinput).

---

### `MyEnum.members`

Each read returns the same frozen array. Members follow the order in which their definition keys were read with `Reflect.ownKeys()`. For ordinary definition objects, array-index names come first in numeric order, followed by other string names in insertion order; a proxy's `ownKeys` trap can supply a different order. Use `map()` or `filter()` to derive views. Copy the array before sorting it in place.

---

### `MyEnum.name`

The optional descriptive name of the enum, stored in a read-only, non-enumerable field. Unnamed enums have `null` here. TypeScript preserves a literal name such as `"Status"` and infers `null` when the name is omitted. Member keys and stored values continue to determine access and lookup.

---

### `myMember.value`

An own, enumerable, read-only string or finite number. Use [`.value`](#mymembervalue) for persistence, explicit comparisons and API payloads. Resolve persisted values with [`fromValue()`](#myenumfromvalueinput). For a numeric HTML form, convert at the form boundary. If the enum has both `0` and `"0"`, use distinct encodings to keep them separate.

## Behaviour

### Simple values

Add a display name when the constant needs a description.

<!-- prettier-ignore -->
```javascript
const pageSize = Constant(25, "Default page size");
console.log(pageSize.value);       // => 25
console.log(pageSize.valueOf());   // => 25
console.log(pageSize.name);        // => "Default page size"
```

### Protected fields, mutable references

Strict-mode assignment to a read-only field throws. Outside strict mode the assignment is ignored. This example uses an ES module, which runs in strict mode.

<!-- prettier-ignore -->
```javascript
import { Constant } from "go-constant";

const settings = Constant({ enabled: true });
settings.value.enabled = false;
settings.description = "Application configuration";
console.log(settings.value.enabled);   // => false
console.log(settings.description);     // => "Application configuration"
const descriptor = Object.getOwnPropertyDescriptor(settings, "value");
console.log(descriptor.writable);      // => false
settings.value = {};                   // => throws TypeError
```

Use `Object.freeze(settings)` to prevent adding or removing properties on that instance as well. It still does not recursively freeze the referenced value.

### Reusable record types

<!-- prettier-ignore -->
```javascript
const Category = Constant.defineType("Category", ["code", "label"]);
const services = Category("services", "Services");
console.log(services.code);                  // => "services"
console.log(services.label);                 // => "Services"
console.log(services instanceof Category);   // => true
console.log(Object.keys(services));          // => ["code", "label"]
```

### Validation and normalisation

<!-- prettier-ignore -->
```javascript
const Category = Constant.defineType("Category", ["code", "label"], {
  validate(code, label) {
    if (typeof code !== "string" || code.trim() === "") {
      throw new TypeError("Category code must be a non-empty string.");
    }
    if (typeof label !== "string" || label.trim() === "") {
      throw new TypeError("Category label must be a non-empty string.");
    }
    return [code.trim().toLowerCase(), label.trim()];
  }
});
const category = Category(" SERVICES ", " Services ");
console.log(category.code);    // => "services"
console.log(category.label);   // => "Services"
```

A validation-only hook returns `undefined` (or has no return statement). It can throw to reject construction. An array replaces the original positional arguments. Returning any other value, including a boolean or a promise, throws `TypeError` during construction. A returned promise can still cause an unhandled rejection even if the caller catches that `TypeError`. Complete asynchronous work before constructing the record.

### Named inputs and default values

The validator's **inputs** do not have to match the positional **output fields**.
Use the existing normalisation hook for readable object arguments and defaults:

<!-- prettier-ignore -->
```javascript
const DeliveryOption = Constant.defineType(
  "DeliveryOption", ["code", "label", "minDays", "maxDays"], {
    validate({ code, label, minDays = 1, maxDays = 3 }) {
      if (typeof code !== "string" || code.trim() === "" ||
          typeof label !== "string" || label.trim() === "") {
        throw new TypeError("Code and label must be non-empty strings.");
      }
      if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) ||
          minDays < 0 || maxDays < minDays) {
        throw new RangeError("Invalid delivery-day range.");
      }
      return [code.trim().toLowerCase(), label.trim(), minDays, maxDays];
    }
  }
);
const courier = DeliveryOption({ code: " COURIER ", label: "Courier delivery" });
console.log(courier.code);     // => "courier"
console.log(courier.minDays);  // => 1
console.log(courier.maxDays);  // => 3
```

The callback decides which input fields are accepted or required; destructuring alone ignores extra fields. Unknown-option rejection applies to **type configuration**, not to these application input objects.

A validator can change the number and shape of arguments. Its output records are therefore not automatically valid constructor inputs.

### Safe instance snapshots

<!-- prettier-ignore -->
```javascript
const Priority = Constant.defineType("Priority", ["code", "rank"], {
  trackInstances: true
});
Priority("low", 10);
Priority("normal", 20);
Priority("urgent", 30);
const descending = Priority.getInstances().sort((a, b) => b.rank - a.rank);
console.log(descending.map(item => item.code));                // => ["urgent", "normal", "low"]
console.log(Priority.getInstances().map(item => item.code));   // => ["low", "normal", "urgent"]
const before = Priority.getInstances();
Priority("critical", 40);
console.log(before.length);                                    // => 3
console.log(Priority.getInstances().length);                   // => 4
```

Each call returns a **new shallow array**, retaining the original instance references. Sorting, clearing, pushing into or freezing that array cannot modify the private registry. A snapshot does not update when more instances are constructed.

### Enum records, identity and freezing

Spread a record into a plain object to use its fields as an expanded definition. Give the plain object its own enumerable [`.value`](#mymembervalue) field containing a string or finite number. [`defineEnum()`](#defineenumdefinitions-name) copies those fields into a new, shallowly frozen member.

<!-- prettier-ignore -->
```javascript
import { defineEnum, defineType } from "go-constant";

const Fruit = defineType("Fruit", ["value", "label"]);
const apple = Fruit("apple", "Apple");
const banana = Fruit("banana", "Banana");

const Fruits = defineEnum({ APPLE: { ...apple }, BANANA: { ...banana } }, "Fruit");

Fruits.APPLE.label;                 // => "Apple"
Fruits.APPLE === apple;             // => false
Fruits.APPLE instanceof Fruit;      // => false
Object.isFrozen(Fruits);            // => true
Object.isFrozen(Fruits.APPLE);      // => true
Object.isFrozen(Fruits.members);    // => true
Object.isFrozen(apple);             // => false

const Favorites = defineEnum({
  APPLE: { value: apple.value, fruit: apple },
  BANANA: { value: banana.value, fruit: banana }
}, "Favorites");

Favorites.APPLE.fruit === apple;          // => true
Favorites.APPLE.fruit instanceof Fruit;   // => true
Object.isFrozen(Favorites.APPLE);         // => true
Object.isFrozen(Favorites.APPLE.fruit);   // => false
```

Store a record in a metadata field when you need to retain the original instance and its methods. Freezing is shallow: the metadata field holds the same record, whose declared fields remain read-only and whose nested values retain their original mutability.

### Enum-like definitions

Use [`defineEnum()`](#defineenumdefinitions-name) for a closed set with built-in value lookup. Use a named table of [`defineType()`](#definetypename-fields-options) records when the application also needs to create additional records of the same type.

<!-- prettier-ignore -->
```javascript
const Day = Constant.defineType("Day", ["number", "name", "shortName"], {
  trackInstances: true,
  valueOf: "number"
});
const Days = Object.freeze({
  MONDAY: Day(1, "Monday", "Mon"),
  TUESDAY: Day(2, "Tuesday", "Tue"),
  WEDNESDAY: Day(3, "Wednesday", "Wed"),
  THURSDAY: Day(4, "Thursday", "Thu"),
  FRIDAY: Day(5, "Friday", "Fri"),
  SATURDAY: Day(6, "Saturday", "Sat"),
  SUNDAY: Day(7, "Sunday", "Sun")
});
console.log(Days.MONDAY.shortName);      // => "Mon"
console.log(Days.SUNDAY.valueOf());      // => 7
console.log(Day.getInstances().length);  // => 7
```

The member table is frozen, but `Day(...)` can still create additional records, and duplicate values are allowed. This does not create a finite enum or a canonical lookup by number/name. A separate table also avoids collisions with constructor statics such as `name`, `prototype` and [`getInstances`](#mytypegetinstances).

### Existing instances and explicit construction

<!-- prettier-ignore -->
```javascript
const original = Constant(1, "One");
console.log(Constant(original) === original);            // => true
const wrapped = Constant(original, "Wrapper");
console.log(wrapped === original);                       // => false
console.log(wrapped.value === original);                 // => true
console.log(wrapped.name);                               // => "Wrapper"
console.log(new Constant(original).value === original);  // => true
```

Only a factory call with **exactly one argument** of the same generated type reuses that instance. It skips initialisation, validation and registration. Additional arguments perform normal construction; explicit `new` always constructs a fresh instance.

The reuse check uses `instanceof`. An object can inherit the type's prototype without having passed validation, so this check does not establish whether the input is trusted.

### Optional coercion

<!-- prettier-ignore -->
```javascript
const Level = Constant.defineType("Level", ["priority"], { valueOf: "priority" });
const Warning = Level(30);
console.log(Warning.valueOf());      // => 30
console.log(Number(Warning));        // => 30
console.log(Object.keys(Warning));   // => ["priority"]
const Distance = Constant.defineType("Distance", ["kilometres"], {
  valueOf() { return this.kilometres * 1000; }
});
console.log(Distance(2).valueOf());  // => 2000
```

[`valueOf()`](#instancevalueof) is non-enumerable and does not affect the record's own-field enumeration. Prefer explicit field access in application logic. A wrapper from [`Constant()`](#constantvalue-name) is an object. Strict equality compares wrapper identity, and even `Constant(false)` is truthy. String and JSON conversion still use their ordinary rules when you add [`valueOf()`](#instancevalueof) alone.

### Explicit lookup with a duplicate policy

For reusable records with an application-owned lookup policy, build an index over an explicit list. For a fixed set, [`defineEnum()`](#defineenumdefinitions-name) handles duplicate checking and exact value lookup directly.

<!-- prettier-ignore -->
```javascript
const Status = Constant.defineType("Status", ["code", "label"]);
const allowedStatuses = Object.freeze([
  Status("draft", "Draft"),
  Status("published", "Published")
]);
function indexByCode(members) {
  const index = new Map();
  for (const member of members) {
    if (index.has(member.code)) {
      throw new Error("Duplicate status code: " + member.code);
    }
    index.set(member.code, member);
  }
  return index;
}
const byCode = indexByCode(allowedStatuses);
function getStatus(code) { return byCode.get(code); }
console.log(getStatus("published").label);                   // => "Published"
console.log(getStatus("published") === allowedStatuses[1]);  // => true
console.log(getStatus("unknown") === undefined);             // => true
Status("archived", "Archived");                              // Does not extend the application-owned list.
console.log(getStatus("archived") === undefined);            // => true
try {
  indexByCode([allowedStatuses[0], Status("draft", "Alternate draft")]);
} catch (error) {
  console.log(error.message);                                // => "Duplicate status code: draft"
}
```

Here duplicates are explicitly rejected and a missing key returns `undefined`.
Keys are matched exactly; normalise external input deliberately when required.
An index built from [`MyType.getInstances()`](#mytypegetinstances) is likewise a snapshot, **not** a live
index. Constructing more records does not update it, and a plain `Map` constructor
would silently choose the last duplicate unless your application checks first.

### Symbol fields

<!-- prettier-ignore -->
```javascript
const key = Symbol("key");
const Item = Constant.defineType("Item", [key, "label"], { valueOf: key });
const item = Item(7, "Seven");
console.log(item[key]);        // => 7
console.log(item.valueOf());   // => 7
```

## TypeScript

The [`defineType()`](#definetypename-fields-options) overloads describe the selected construction form. Positional overloads
have no validator; validator overloads can infer field types from a returned tuple.
Optional or erased validator returns receive conservative types. A schema with a
[`valueOf`](#a-data-field-named-valueof) data field cannot also configure a coercion method. When no fields are
declared, custom coercion must use a callback because no field selector can apply.

Null and undefined schemas accept typed validator inputs just like an empty array schema.

Value types cannot be inferred from property names alone. A schema such as `["code", "rank"]` does not prove that its values are a string and number. Untyped fields therefore default to `unknown`. Annotating the validator's arguments provides a checked constructor signature, and its return tuple describes normalised fields:

<!-- prettier-ignore -->
```typescript
import Constant from "go-constant";

const Priority = Constant.defineType("Priority", ["code", "rank"] as const, {
  trackInstances: true,
  valueOf: "rank",
  validate(code: string, rank: number) {
    if (!Number.isFinite(rank)) throw new TypeError("rank must be finite");
    return [code.trim(), rank] as const;
  }
});

const urgent = Priority(" urgent ", 30);
const code: string = urgent.code;
const rank: number = urgent.valueOf();
const snapshot = Priority.getInstances();
snapshot.reverse();            // Array is mutable; fields are read-only.
// urgent.rank = 40;           // Compile error; also protected at runtime.
// Priority(30, "urgent");     // Compile error.
```

For a type without a validator, explicit key/value tuples are also supported:

```typescript
import { defineType } from 'go-constant';

const Category = defineType<['code', 'label'], [string, string]>('Category', ['code', 'label'], {
  trackInstances: true,
  valueOf: 'code'
});
const item = Category('services', 'Services');
const label: string = item.label;
const savedLabel: string = Category.getInstances()[0].label;
// Fields stay precise, but the selector cannot be inferred after two explicit
// type arguments. Read the field or use an inferred validator for typed coercion.
const coercionResult: unknown = item.valueOf();
```

Explicit types are compile-time declarations, not runtime input validation. Missing/optional tuple values and normalised return tuples are represented in the generated fields. A dynamic field array cannot guarantee that a particular key exists, so its fields are typed conservatively. Read-only declarations do not make nested values deeply immutable.

### Enum definitions and lookup

For definitions typed with an index signature, use [`members`](#myenummembers) or [`fromValue()`](#myenumfromvalueinput) because the type gives no guarantee about a particular name. Use object literals for named member inference. The own-data property rules are checked at runtime, including for typed inputs.

TypeScript checks the visible shape of the input. [`defineEnum()`](#defineenumdefinitions-name) enforces the plain-object and own-data requirements at runtime. Spreading a record gives TypeScript the shape of the copied fields. Storing the record in a metadata field preserves its type and methods. See [record identity and freezing](#enum-records-identity-and-freezing).

### Named-input typing

Annotate the input object and return a tuple to keep input and output types distinct:

```typescript
import { defineType } from 'go-constant';

type DeliveryInput = { code: string; minDays?: number; maxDays?: number };
const Delivery = defineType('Delivery', ['code', 'minDays', 'maxDays'], {
  validate({ code, minDays = 1, maxDays = 3 }: DeliveryInput) {
    if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays) {
      throw new RangeError('Invalid day range');
    }
    return [code.trim().toLowerCase(), minDays, maxDays] as const;
  }
});
const courier = Delivery({ code: ' COURIER ' });
const code: string = courier.code;
const days: number = courier.minDays;
```

### Validation-only callbacks and erased returns

At runtime a missing return is `undefined`. In declarations, however, `void`
can hide an actual return value. A hook typed only as returning `void` therefore
produces `unknown` output field types: it might have returned a normalisation
array. To retain precise input types, annotate validation-only hooks with
`: undefined`; normalisation hooks should return a typed tuple instead.

```typescript
import { defineType } from 'go-constant';

const Code = defineType('Code', ['code'], {
  validate(code: string): undefined {
    if (code.trim() === '') throw new TypeError('Code cannot be empty');
  }
});
const code: string = Code('draft').code;

const erased: (code: string) => void = (code) => [code.length];
const Length = defineType('Length', ['length'], { validate: erased });
const length: unknown = Length('draft').length;
if (typeof length === 'number') {
  const formatted: string = length.toFixed(0);
}
```

### Instance identity and typing limitations

The default [`Constant`](#constantvalue-name) keeps its typed single-wrapper reuse shortcut. Its
class-shaped, type-only representation excludes prototype methods and private
identity from object-spread types: `Constant({ ...Constant(12) }).value` is the
copied object, not `12`. No additional class, symbol or method is exported or
installed at runtime.

Generated types expose only their **constructor input tuple**, not a universal
`MyType(instance)` overload. Their structural output shapes cannot prove that two
values came from the same generated constructor. Thus a string-input `Category`
rejects `Category(category)` during type checking, even though exact-instance
reuse still works in JavaScript. Keep the instance directly when you already have
it, or supply valid constructor inputs to create a new record. Unknown input
signatures stay permissive.

These declarations are not runtime authenticity checks. Assertions, prototype
mutation, separately loaded copies, and operations whose declared types retain
identity despite copying (for example `Object.assign`) can defeat static identity
modelling. Do not use type compatibility to bypass boundary validation.

[`Constant.Value<T>`](#instance-identity-and-typing-limitations) is the wrapper type for CommonJS/namespace use; ESM consumers can also `import type { Value, Type } from "go-constant"`. [`Constant.Type`](#mytypeargs) and [`Constant.DefineType`](#definetypename-fields-options) describe the generated constructor and factory types. These are declaration-only names, not properties exported by the runtime [`Constant`](#constantvalue-name) function. The declarations distinguish wrappers from plain structural lookalikes and object-spread copies. Generated record types are still structural, not nominally unique per [`defineType()`](#definetypename-fields-options) invocation: identical record shapes do not prove identical runtime constructors.

### Optional configuration and inferred fields

An optional or nullable normaliser may not run. The declarations retain both the
original input and normalised output types in that case. Required normalisers
keep their precise output types, and an optional coercion selector does not
promise that a custom method was installed.

[`getInstances()`](#mytypegetinstances) throws `Error` if tracking is disabled. TypeScript gives it a return type of `never` when the options establish that tracking is disabled. With an optional or dynamic tracking flag, a successful call returns a snapshot array.

<!-- prettier-ignore -->
```typescript
import Constant from "go-constant";

function configuration(enabled: boolean): {
  validate?: (text: string) => readonly [number];
  trackInstances?: true;
} {
  return enabled ? {
    validate: text => [text.length] as const,
    trackInstances: true
  } : {};
}

const Label = Constant.defineType("Label", ["code"], configuration(false));
const label = Label("draft");
const code: string | number = label.code;
console.log(code);             // => "draft"
if (typeof code === "number") console.log(code.toFixed(0));

// Optional `true` is not the same as a required `true` flag.
Label.getInstances();          // => throws Error
```

Use plain configuration objects with **own** option properties. Runtime options
inherited from a prototype are intentionally ignored. TypeScript cannot establish
property ownership from a structural type; class prototype methods are not a way
to supply these hooks. Values should match their declared types, without casts
that assert options or normalisation results which are not actually present.

### Dynamic schema keys

A tuple slot typed as `"left" | "right"` represents one selected property name,
not two guaranteed fields. Such fields are optional in the resulting type. Broad
`string`, `symbol`, and open template-literal keys are likewise conservative;
exact singleton keys remain required and keep their positional types.

<!-- prettier-ignore -->
```typescript
import Constant from "go-constant";

function selectedField(): "left" | "right" { return "left"; }
const Selected = Constant.defineType("Selected", [selectedField(), "label"], {
  validate(value: number, label: string) { return [value, label] as const; }
});
const selected = Selected(42, "Answer");
const maybeLeft: number | undefined = selected.left;
const maybeRight: number | undefined = selected.right;
const label: string = selected.label;
if (maybeLeft !== undefined) console.log(maybeLeft.toFixed(0));  // => "42"
```

A broad indexed lookup can also reach a fixed field: for a schema containing a
`string` key and a literal `"enabled"` boolean field, indexing with an arbitrary
string must allow the boolean as well as the dynamic field's value and `undefined`.
These declarations describe schema-derived fields; they do not make dynamic
names unique or stop runtime validation from rejecting duplicate keys.

### A data field named `valueOf`

A declared [`valueOf`](#a-data-field-named-valueof) data field requires no coercion option, including when using
a validator or instance tracking. Omit the option or pass `null` or `undefined`
to leave coercion disabled.

<!-- prettier-ignore -->
```typescript
import Constant from "go-constant";

const NumericData = Constant.defineType("NumericData", ["valueOf"], {
  validate(value: number) { return [value] as const; },
  trackInstances: true
});
const item = NumericData(7);
const value: number = item.valueOf;              // This is a field, not a method.
console.log(value);                              // => 7
console.log(NumericData.getInstances().length);  // => 1
```

A function-valued data field remains callable. Combining this data field with
an actual non-null `valueOf` option still throws because the field would shadow
the configured method.

Object spread copies declared own fields, including an own [`valueOf`](#a-data-field-named-valueof) data field. It does not copy a configured prototype [`valueOf`](#instancevalueof) method; the copied plain object uses ordinary object coercion.

## Performance

Each construction defines one protected property per declared field. Values are stored by reference, so nested objects are not cloned. Validation adds the cost of the callback you supply.

Tracking keeps a strong reference to each registered record while its type remains reachable. Each [`getInstances()`](#mytypegetinstances) call allocates and copies a shallow array, so snapshot cost grows with the number of tracked records. Use tracking for bounded definition sets; see the [construction and registration rules](#mytypeargs) for the registration boundary.

See the [benchmark guide](https://github.com/fishgoldworks/go-constant/blob/master/benchmarks/README.md) for reproducible comparisons and the [historical performance report](https://github.com/fishgoldworks/go-constant/blob/master/docs/performance.md) for the measurements behind the built-in wrapper optimisation. Benchmark timings are not correctness gates.
