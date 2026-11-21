'use strict';

const objectConstructorSource = Function.prototype.toString.call(Object);

function isDefinitionObject(input) {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function isPlainDataObject(input) {
  const prototype = Object.getPrototypeOf(input);

  if (prototype === null || prototype === Object.prototype) {
    return true;
  }

  // Match another realm's Object.prototype without reading an inherited constructor.
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');

  return (
    constructor !== undefined &&
    typeof constructor.value === 'function' &&
    Function.prototype.toString.call(constructor.value) === objectConstructorSource &&
    constructor.value.prototype === prototype
  );
}

function readDataProperty(object, key, context) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);

  if (
    typeof key !== 'string' ||
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    throw new TypeError(context + ' requires an enumerable string data property: ' + String(key));
  }

  return descriptor.value;
}

function createMember(definition, name) {
  let member;

  if (isDefinitionObject(definition)) {
    const context = 'Enum member ' + JSON.stringify(name);

    if (!isPlainDataObject(definition)) {
      throw new TypeError(context + ' requires a plain data object. Use object spread to copy the record fields.');
    }

    member = {};
    for (const key of Reflect.ownKeys(definition)) {
      const value = readDataProperty(definition, key, context);

      // Define even __proto__ as data, with no inherited setter involved.
      Object.defineProperty(member, key, { value, enumerable: true });
    }
  } else {
    member = { value: definition };
  }

  const value = Object.getOwnPropertyDescriptor(member, 'value');

  if (!value || (typeof value.value !== 'string' && !Number.isFinite(value.value))) {
    throw new TypeError('Enum member ' + JSON.stringify(name) + ' requires an own string or finite number value.');
  }

  return Object.freeze(member);
}

/**
 * Creates a fixed set of named, shallowly frozen members with exact value lookup.
 * Expanded definitions must be plain data objects. Their own enumerable string
 * properties are copied, while nested metadata stays shared. The factory does
 * not modify or freeze the caller's definitions.
 * @param {Object} definitions Named strings, finite numbers or plain objects with an own string/finite-number `value`.
 * @param {string|null} [name=null] Optional descriptive name stored in the enum's read-only `name` field.
 * @returns {Object} A frozen enum with named members, `name`, `members`, `fromValue` and `hasValue`.
 * @throws {TypeError} For invalid definitions or names, reserved member keys or duplicate values.
 * @see https://github.com/fishgoldworks/go-constant/blob/master/docs/API.md#defineenumdefinitions-name
 */
function defineEnum(definitions, name = null) {
  if (!isDefinitionObject(definitions)) {
    throw new TypeError('Enum definitions must be an object.');
  }

  if (name !== null && typeof name !== 'string') {
    throw new TypeError('Enum name must be a string, null, or undefined.');
  }

  const enumeration = {};
  const members = [];
  const namesByValue = new Map();

  for (const memberName of Reflect.ownKeys(definitions)) {
    if (memberName === 'name' || memberName === 'members' || memberName === 'fromValue' || memberName === 'hasValue') {
      throw new TypeError('Reserved enum member name: ' + memberName);
    }

    const definition = readDataProperty(definitions, memberName, 'Enum definitions');
    const member = createMember(definition, memberName);
    const first = namesByValue.get(member.value);

    if (first !== undefined) {
      const prefix = name === null ? '' : JSON.stringify(name) + ': ';

      throw new TypeError(
        prefix + 'Duplicate enum value for ' + JSON.stringify(first) + ' and ' + JSON.stringify(memberName) + '.'
      );
    }

    namesByValue.set(member.value, memberName);
    Object.defineProperty(enumeration, memberName, { value: member, enumerable: true });
    members.push(member);
  }

  Object.defineProperties(enumeration, {
    name: { value: name },
    members: { value: Object.freeze(members) },
    fromValue: {
      value(input) {
        const memberName = namesByValue.get(input);

        return memberName === undefined ? undefined : enumeration[memberName];
      }
    },
    hasValue: { value: (input) => namesByValue.has(input) }
  });

  return Object.freeze(enumeration);
}

module.exports = defineEnum;
