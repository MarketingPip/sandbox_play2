#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var Module = require('module');

function mkdirpSync(dir) {
  if (!dir || dir === '.' || dir === path.sep) return;

  var parts = path.resolve(dir).split(path.sep);
  var current = '';

  for (var i = 0; i < parts.length; i++) {
    current += parts[i] + path.sep;
    try {
      fs.mkdirSync(current);
    } catch (e) {
      if (e && e.code === 'EEXIST') continue;
      throw e;
    }
  }
}

function parseArgs(argv) {
  var args = {};
  for (var i = 2; i < argv.length; i++) {
    var key = argv[i];
    if (key === '--version') args.version = argv[++i];
    if (key === '--out') args.out = argv[++i];
  }
  if (!args.version || !args.out) {
    throw new Error('Usage: collect-node-builtins.js --version vX.Y.Z --out file.json');
  }
  return args;
}

function isRequireable(name) {
  try {
    require.resolve(name);
    return true;
  } catch (e) {
    return false;
  }
}

function safeRequire(name) {
  try {
    return require(name);
  } catch (e) {
    return null;
  }
}

function describeValue(value) {
  if (value === null) return { type: 'null' };

  if (Array.isArray(value)) return { type: 'array' };

  switch (typeof value) {
    case 'undefined':
      return { type: 'undefined' };
    case 'boolean':
      return { type: 'boolean' };
    case 'number':
      return { type: 'number' };
    case 'string':
      return { type: 'string' };
    case 'symbol':
      return { type: 'symbol' };
    case 'function':
      var out = { type: 'function' };
      try {
        out.name = value.name || null;
      } catch (e) {}
      try {
        out.length = (typeof value.length === 'number') ? value.length : null;
      } catch (e) {}
      return out;
    case 'object':
      if (value instanceof RegExp) return { type: 'regexp' };
      if (value instanceof Date) return { type: 'date' };
      if (value instanceof Error) return { type: 'error' };
      return { type: 'object' };
    default:
      return { type: typeof value };
  }
}

function getExports(mod) {
  if (mod === null || mod === undefined) return null;

  if (typeof mod === 'function' || typeof mod === 'object') {
    var out = {};
    var keys = Object.keys(mod).sort();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        out[key] = describeValue(mod[key]);
      } catch (e) {
        out[key] = { type: 'unknown' };
      }
    }
    return out;
  }

  return {
    value: describeValue(mod)
  };
}

function uniqSorted(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var x = arr[i];
    if (!seen[x]) {
      seen[x] = true;
      out.push(x);
    }
  }
  return out.sort();
}

function main() {
  var parsed = parseArgs(process.argv);
  var version = parsed.version;
  var out = parsed.out;

  var builtinModules = uniqSorted(
    (process.builtinModules || []).concat(Module.builtinModules || [])
  );

  var modules = {};

  for (var i = 0; i < builtinModules.length; i++) {
    var name = builtinModules[i];
    var candidates = [name];
    if (name.indexOf('node:') !== 0) candidates.push('node:' + name);

    var loaded = null;
    var usedName = null;

    for (var j = 0; j < candidates.length; j++) {
      var candidate = candidates[j];
      if (isRequireable(candidate)) {
        loaded = safeRequire(candidate);
        usedName = candidate;
        break;
      }
    }

    modules[name] = {
      requestedName: name,
      resolvedName: usedName,
      requireable: usedName !== null,
      exports: getExports(loaded)
    };
  }

  var payload = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    requestedVersion: version,
    platform: process.platform,
    arch: process.arch,
    modules: modules
  };

  mkdirpSync(path.dirname(out));
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
}

main();
