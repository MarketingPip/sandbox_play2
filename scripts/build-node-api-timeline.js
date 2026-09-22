#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--input-dir') args.inputDir = argv[++i];
    if (key === '--json-out') args.jsonOut = argv[++i];
    if (key === '--markdown-out') args.markdownOut = argv[++i];
  }
  if (!args.inputDir || !args.jsonOut || !args.markdownOut) {
    throw new Error('Usage: build-node-api-timeline.js --input-dir artifacts --json-out out.json --markdown-out out.md');
  }
  return args;
}

function versionKey(v) {
  return v.replace(/^v/, '').split('.').map(Number);
}

function compareVersions(a, b) {
  const aa = versionKey(a);
  const bb = versionKey(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const x = aa[i] || 0;
    const y = bb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function loadInputs(inputDir) {
  return fs.readdirSync(inputDir)
    .filter(f => /^node-v.+\.json$/.test(f))
    .map(f => {
      const raw = fs.readFileSync(path.join(inputDir, f), 'utf8');
      return JSON.parse(raw);
    })
    .sort((a, b) => compareVersions(a.nodeVersion, b.nodeVersion));
}

function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function buildTimeline(inputs) {
  const moduleMap = new Map();

  for (const input of inputs) {
    const version = input.nodeVersion;
    for (const [modName, modInfo] of Object.entries(input.modules || {})) {
      if (!moduleMap.has(modName)) {
        moduleMap.set(modName, {
          module: modName,
          firstSeen: version,
          lastSeen: version,
          versions: [],
          exports: new Map(),
        });
      }

      const rec = moduleMap.get(modName);
      rec.lastSeen = version;
      rec.versions.push(version);

      const exports = modInfo.exports || {};
      if (exports && typeof exports === 'object' && !exports.value) {
        for (const [exportName, meta] of Object.entries(exports)) {
          if (!rec.exports.has(exportName)) {
            rec.exports.set(exportName, {
              name: exportName,
              firstSeen: version,
              lastSeen: version,
              versions: [],
              types: new Set(),
            });
          }
          const er = rec.exports.get(exportName);
          er.lastSeen = version;
          er.versions.push(version);
          if (meta && meta.type) er.types.add(meta.type);
        }
      }
    }
  }

  const modules = [...moduleMap.values()]
    .sort((a, b) => a.module.localeCompare(b.module))
    .map(m => ({
      module: m.module,
      firstSeen: m.firstSeen,
      lastSeen: m.lastSeen,
      versions: m.versions,
      exports: [...m.exports.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => ({
          name: e.name,
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
          versions: e.versions,
          types: [...e.types].sort(),
        })),
    }));

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: inputs.length,
    versions: inputs.map(i => i.nodeVersion),
    modules,
  };
}

function inferRemovals(timeline) {
  const allVersions = timeline.versions;
  const versionSet = new Set(allVersions);

  for (const mod of timeline.modules) {
    const seen = new Set(mod.versions);
    const missing = allVersions.filter(v => !seen.has(v));
    if (missing.length > 0 && seen.size > 0) {
      const firstSeen = mod.firstSeen;
      const laterMissing = missing.filter(v => compareVersions(v, firstSeen) > 0);
      if (laterMissing.length > 0) {
        mod.removedAfter = laterMissing[0];
      }
    }

    for (const exp of mod.exports) {
      const expSeen = new Set(exp.versions);
      const expMissing = allVersions.filter(v => !expSeen.has(v));
      if (expMissing.length > 0 && expSeen.size > 0) {
        const laterMissing = expMissing.filter(v => compareVersions(v, exp.firstSeen) > 0);
        if (laterMissing.length > 0) {
          exp.removedAfter = laterMissing[0];
        }
      }
    }
  }

  return timeline;
}

function renderMarkdown(timeline) {
  const lines = [];
  lines.push('# Node.js Built-in API Timeline');
  lines.push('');
  lines.push(`Generated: ${timeline.generatedAt}`);
  lines.push('');
  lines.push(`Versions analyzed: ${timeline.versions.join(', ')}`);
  lines.push('');
  lines.push('## Modules');
  lines.push('');

  for (const mod of timeline.modules) {
    const removed = mod.removedAfter ? `, removed after ${mod.removedAfter}` : '';
    lines.push(`- \`${mod.module}\` — first seen ${mod.firstSeen}, last seen ${mod.lastSeen}${removed}`);
  }

  lines.push('');
  lines.push('## Export Additions');
  lines.push('');

  for (const mod of timeline.modules) {
    const added = mod.exports.filter(e => e.firstSeen !== mod.firstSeen);
    if (added.length === 0) continue;

    lines.push(`### ${mod.module}`);
    lines.push('');
    for (const e of added) {
      const removed = e.removedAfter ? `, removed after ${e.removedAfter}` : '';
      lines.push(`- \`${e.name}\` — added ${e.firstSeen}${removed}`);
    }
    lines.push('');
  }

  lines.push('## Export Removals');
  lines.push('');

  let anyRemoval = false;
  for (const mod of timeline.modules) {
    const removedExports = mod.exports.filter(e => e.removedAfter);
    if (removedExports.length === 0) continue;

    anyRemoval = true;
    lines.push(`### ${mod.module}`);
    lines.push('');
    for (const e of removedExports) {
      lines.push(`- \`${e.name}\` — removed after ${e.removedAfter}`);
    }
    lines.push('');
  }

  if (!anyRemoval) {
    lines.push('No export removals detected from runtime snapshots.');
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const { inputDir, jsonOut, markdownOut } = parseArgs(process.argv);
  const inputs = loadInputs(inputDir);
  if (inputs.length === 0) {
    throw new Error(`No input files found in ${inputDir}`);
  }

  let timeline = buildTimeline(inputs);
  timeline = inferRemovals(timeline);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.mkdirSync(path.dirname(markdownOut), { recursive: true });

  fs.writeFileSync(jsonOut, JSON.stringify(timeline, null, 2) + '\n');
  fs.writeFileSync(markdownOut, renderMarkdown(timeline) + '\n');
}

main();
