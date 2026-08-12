'use strict';
const serverless = require('serverless-http');
const { app } = require('../../server/index');

module.exports.handler = serverless(app, {
  binary: ['multipart/form-data', 'audio/*', 'video/*'],
});
