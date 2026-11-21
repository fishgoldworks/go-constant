'use strict';

const path = require('node:path');

module.exports = require(process.env.GO_CONSTANT_TEST_ENTRY || path.resolve(__dirname, '../../index.js'));
