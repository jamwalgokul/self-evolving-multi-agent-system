// Sample app with intentional issues for testing AI agents
// This file contains various bugs and vulnerabilities for demonstration

const express = require('express');
const app = express();

// BUG: Hardcoded API key (SecureMax should catch this)
const API_KEY = "sk-1234567890abcdef1234567890abcdef";
var SECRET_TOKEN = "my-super-secret-token-12345";

// BUG: Using var instead of const/let (Locator should catch)
var port = 3001;

// BUG: Debug mode enabled (SecureMax should catch)
const DEBUG = true;

// BUG: Wildcard CORS (SecureMax should catch)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// BUG: SQL injection vulnerability (SecureMax should catch)
app.get('/user', (req, res) => {
  const query = "SELECT * FROM users WHERE id = " + req.query.id;
  console.log("Executing query:", query);
  res.json({ query });
});

// BUG: XSS vulnerability via innerHTML
app.get('/page', (req, res) => {
  const html = `<div>${req.query.content}</div>`;
  res.send(html);
});

// BUG: Command injection (SecureMax should catch)
const { exec } = require('child_process');
app.get('/ping', (req, res) => {
  exec('ping ' + req.query.host, (error, stdout) => {
    res.send(stdout);
  });
});

// BUG: Eval usage (Locator + SecureMax should catch)
app.post('/calculate', (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});

// BUG: No error handling (ErrorMax should catch)
app.get('/file', (req, res) => {
  const fs = require('fs');
  const data = fs.readFileSync(req.query.path);
  res.send(data);
});

// BUG: Empty catch block (Locator should catch)
try {
  JSON.parse("invalid json{{{");
} catch (e) {}

// BUG: Loose equality (Locator should catch)
function checkAdmin(role) {
  if (role == "admin") {
    return true;
  }
  return false;
}

// BUG: Password comparison (SecureMax should catch)
function authenticate(password) {
  if (password === "admin123") {
    return true;
  }
}

// BUG: Debugger statement left in (Locator should catch)
function processData(data) {
  debugger;
  return data;
}

// TODO: Fix this function later (Locator should catch TODOs)
// FIXME: Memory leak in this handler
// HACK: Temporary workaround

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
