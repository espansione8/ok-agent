// Extracts the §4–§6 embedded code blocks from SKILL.md VERBATIM and assembles
// an importable ESM module for behavioral regression tests. Any SKILL.md edit
// that changes embedded-code behavior shows up here at test time — that is the
// whole point: the skill's code lives in prose, so prose drift = code drift.
//
// The extractor FAILS (nonzero exit) if:
//   - any section boundary marker is missing (document restructure), or
//   - the assembled code does not parse (`node --check` equivalent via vm).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = join(REPO, 'SKILL.md');

const lines = readFileSync(SRC, 'utf8').split('\n');
const findLine = (needle) => {
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx === -1) {
    console.error(`extract-embedded: marker not found in SKILL.md: "${needle}" — section layout drifted, update this extractor`);
    process.exit(1);
  }
  return idx; // 0-based line index of the marker line
};

// Section spans (marker line itself is prose, excluded via +1)
const a = findLine('// §4.1 — imports + CLI') + 1;
const b = findLine('5. SWEEP (v2.1: batched census') - 2;     // stop before §5's ==== rule + blank line
const c = findLine('5. SWEEP (v2.1: batched census') + 2;     // start after the 2-line §5 banner (heading + rule)
const d = findLine('6. PARAM RESOLUTION + WARM-UP') - 2; // -1 is §6's ==== rule, not §5 code
const e = findLine('// §6.1 — resolveParam (embedded') + 1;
const f = findLine('concreteRoutes = every static (param-less) manifest route') - 1; // resolveParam body ends before §6's prose

const embedded = [
  ...lines.slice(a, b + 1),
  ...lines.slice(c, d + 1),
  ...lines.slice(e, f),
].join('\n');

// Test-only fixtures the generated script normally gets from Phase A / §7:
// NAV_TREE would be produced by the codebase scan; MODE's exit guard belongs
// to main(), not to the helpers under test.
const preamble = `\
const NAV_TREE = { '': [{ label: 'Home', href: '/' }], 'Invoices': [{ label: 'All invoices', href: '/invoices' }] };
`;
const transformed = embedded
  .replace("import { chromium } from 'playwright';", 'const chromium = {};')
  // (line-anchored: the guard line contains ${MODE} inside a template
  // literal, so brace-counting regexes would stop at the wrong `}`)
  .replace(/^if \(!\['sweep', 'scripted', 'both'\]\.includes\(MODE\)\).*\n/m, '');

mkdirSync(join(HERE, '.build'), { recursive: true });
const out = join(HERE, '.build', 'embedded.mjs');
writeFileSync(
  out,
  preamble +
  transformed +
    `\nexport { census, probe, sweepRoute, dedupKey, writeCoverage, visited, routeQueue, DESTRUCTIVE, CLICKABLE, NAV_TREE, MAX_CLICKS, CURSOR_JS, wirePageGuards, backupDatabase, restoreDatabaseBackup, resolveParam, DEEP_SELECTS, EXCLUDES, PARAM_OVERRIDES, navHoverLoc, navLabelRe, P, FAST, BASE_URL, closeModal, fingerprint, resolveFresh };\n`
);

// Syntax gate: `node --check` on the emitted .mjs — the exact gate §2 mandates
// for generated scripts, applied to the extracted code (ESM-aware, unlike
// vm.Script which parses as CommonJS).
const chk = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
if (chk.status !== 0) {
  console.error('extract-embedded: assembled embedded code FAILED node --check — SKILL.md embedded blocks are broken:\n' + (chk.stderr || chk.stdout));
  process.exit(1);
}
console.log('extract-embedded: wrote ' + out + ' (' + transformed.split('\n').length + ' lines, node --check OK)');
