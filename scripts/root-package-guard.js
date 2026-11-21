'use strict';

console.error(
  'The development root is private. Run npm run pack:package or npm run verify:all, then publish the verified tarball.'
);
process.exitCode = 1;
