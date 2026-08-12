'use strict';
const serverless = require('serverless-http');
const { app } = require('../../server/index');

// Netlify redirect: /api/* → /.netlify/functions/api/:splat
// After rewrite, the function receives /signal/send (no /api prefix).
// Express is mounted on both /api (for local dev) and / (for Netlify).
// No basePath needed — serverless-http passes path as-is to Express.
module.exports.handler = serverless(app, {
  binary: ['multipart/form-data', 'audio/*', 'video/*'],
});
