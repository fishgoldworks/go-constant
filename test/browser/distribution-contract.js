'use strict';

module.exports = {
  global: 'goConstant',
  fixtures: [],
  extra: '',
  pageExtra: '',
  aliases: [],
  check(Api) {
    function equal(actual, expected) {
      if (actual !== expected) throw Error('Expected ' + String(expected) + ', received ' + String(actual));
    }

    const value = Api(42, 'Answer');

    equal(Api.Constant, Api);
    equal(Api.Constant(25).value, 25);
    equal(value.valueOf(), 42);
    equal(Api(value), value);
    const Status = Api.defineEnum({ DRAFT: 'draft', LIVE: { value: 'live', label: 'Live' } }, 'Status');

    equal(Status.name, 'Status');
    equal(Api.defineEnum({}).name, null);
    equal(Object.getOwnPropertyDescriptor(Status, 'name').enumerable, false);
    equal(Status.fromValue('live'), Status.LIVE);
    equal(Status.LIVE.label, 'Live');
    equal(Status.hasValue('removed'), false);
    equal(Object.isFrozen(Status.members), true);

    const Size = Api.defineType('Size', ['value', 'width']);
    const small = Size('small', 64);
    const large = Size('large', 256);
    const AvatarSize = Api.defineEnum({ SMALL: { ...small }, LARGE: { ...large } });
    let memberError;

    try {
      Api.defineEnum({ SMALL: small });
    } catch (error) {
      memberError = error;
    }

    equal(memberError.name, 'TypeError');
    equal(AvatarSize.fromValue('small').width, 64);
    equal(AvatarSize.SMALL === small, false);

    equal(Object.getOwnPropertyDescriptor(value, 'value').writable, false);
    const Type = Api.defineType('Record', ['n'], {
      validate(n) {
        return [n * 2];
      },
      valueOf: 'n',
      trackInstances: true
    });
    const item = Type(3);

    equal(item.valueOf(), 6);
    equal(Type.getInstances()[0], item);
    Type.getInstances().length = 0;
    equal(Type.getInstances().length, 1);
    equal('instances' in Type, false);

    const Untracked = Api.defineType('Untracked', ['code']);
    let trackingError;

    Untracked('A');

    try {
      Untracked.getInstances();
    } catch (error) {
      trackingError = error;
    }

    equal(trackingError.name, 'Error');
    equal(trackingError.constructor.name, 'Error');
    equal(
      trackingError.message,
      'Cannot get instances of "Untracked": instance tracking was not enabled.\n' +
        'Define the type with { trackInstances: true } to collect instances.'
    );
  }
};
