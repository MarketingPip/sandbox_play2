#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
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
  } catch {
    return false;
  }
}

function safeRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

function describeValue(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array' };
  switch (typeof value) {
    case 'undefined': return { type: 'undefined' };
    case 'boolean': return { type: 'boolean' };
    case 'number': return { type: 'number' };
    case 'string': return { type: 'string' };
    case 'symbol': return { type: 'symbol' };
    case 'function': {
      const out = { type: 'function' };
      try {
        out.name = value.name || null;
      } catch {}
      try {
        out.length = value.length ?? null;
      } catch {}
      return out;
    }
    case 'object': {
      if (value instanceof RegExp) return { type: 'regexp' };
      if (value instanceof Date) return { type: 'date' };
      if (value instanceof Error) return { type: 'error' };
      return { type: 'object' };
    }
    default:
      return { type: typeof value };
  }
}

function getExports(mod) {
  if (mod === null || mod === undefined) return null;

  if (typeof mod === 'function' || typeof mod === 'object') {
    const out = {};
    for (const key of Object.keys(mod).sort()) {
      try {
        out[key] = describeValue(mod[key]);
      } catch {
        out[key] = { type: 'unknown' };
      }
    }
    return out;
  }

  return {
    value: describeValue(mod)
  };
}

function main() {
  const { version, out } = parseArgs(process.argv);

  const builtinModules = Array.from(new Set([
    ...(process.builtinModules || []),
    ...(Module.builtinModules || []),
  ])).sort();

  const modules = {};

  for (const name of builtinModules) {
    const candidates = [name];
    if (!name.startsWith('node:')) candidates.push(`node:${name}`);

    let loaded = null;
    let usedName = null;

    for (const candidate of candidates) {
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
      exports: getExports(loaded),
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    requestedVersion: version,
    platform: process.platform,
    arch: process.arch,
    modules,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
}

main();
