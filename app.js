const express = require('express');
const app = express();

// Middleware (body parser, etc.)
app.use(express.json());

module.exports = app;
