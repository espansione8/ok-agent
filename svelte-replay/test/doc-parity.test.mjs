// Doc-parity test (v2.9.3): the §3 flag lists in SKILL.md must never drift
// from the code tables that actually implement the CLIs. SKILL.md §4.1's
// FLAG_HELP is canonical for the emitted replay script; scripts/generate.mjs's
// GEN_FLAG_ARITY is canonical for the generator. §3 partitions flags into
// replay-time / generator-time / both-surfaces; this test asserts the three
// §3 blocks add up to exactly those tables (replay ∪ both == FLAG_HELP,
// generator ∪ both == GEN_FLAG_ARITY), so a flag added to a table without a
// §3 row — or advertised in §3 without a table row — fails here.
//
// Everything is read as text (no extraction, no execution): SKILL.md markers
// below are the stable section anchors; if you move them, the test tells you
// which one went missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const gen = readFileSync(join(HERE, '..', 'scripts', 'generate.mjs'), 'utf8');
// §3 markers like 'BOTH SURFACES' can also appear in changelog prose ABOVE
// §3 — scope every §3 slice to the §3 section so changelog mentions can't
// shift the parsed blocks.
const s3Start = skill.indexOf('3. CLI');
assert.notEqual(s3Start, -1, 'SKILL.md §3 header not found');
const S3 = skill.slice(s3Start);

function sliceBetween(label, text, start, end) {
  const i = text.indexOf(start);
  assert.notEqual(i, -1, `${label}: marker not found: "${start}"`);
  const j = text.indexOf(end, i + start.length);
  assert.notEqual(j, -1, `${label}: closing marker not found after "${start}": "${end}"`);
  return text.slice(i + start.length, j);
}
const flagNames = (block) => new Set([...block.matchAll(/--([a-z0-9-]+)/g)].map((m) => m[1]));
const diff = (have, want) => ({
  missing: [...want].filter((n) => !have.has(n)).sort(),
  extra: [...have].filter((n) => !want.has(n)).sort(),
});

test('doc-parity: §3 replay-time ∪ both-surfaces flags == every FLAG_HELP row', () => {
  const helpBlock = sliceBetween('FLAG_HELP', skill, 'const FLAG_HELP = [', '\n];');
  const rows = [...helpBlock.matchAll(/^\s*\['([a-z0-9-]+)',\s*([01]),\s*'((?:[^'\\]|\\.)*)'\],?$/gm)];
  assert.ok(rows.length >= 25, `FLAG_HELP must carry the full table, parsed ${rows.length} rows`);
  const replaySec = sliceBetween('§3 replay', S3, 'REPLAY-TIME FLAGS', 'GENERATOR-TIME FLAGS');
  const bothSec = sliceBetween('§3 both', S3, 'BOTH SURFACES', '--no-manage-dev-server (replay)');
  const advertised = new Set([...flagNames(replaySec), ...flagNames(bothSec)]);
  const want = new Set(rows.map((m) => m[1]));
  const d = diff(advertised, want);
  assert.deepEqual(d, { missing: [], extra: [] },
    `§3 replay+both flags must equal FLAG_HELP rows (missing from §3: ${d.missing.join(', ')}; in §3 but not FLAG_HELP: ${d.extra.join(', ')})`);
});

test('doc-parity: §3 generator-time ∪ both-surfaces flags == every GEN_FLAG_ARITY key', () => {
  const genBlock = sliceBetween('GEN_FLAG_ARITY', gen, 'const GEN_FLAG_ARITY = {', '\n};');
  const keys = [...genBlock.matchAll(/'([a-z0-9-]+)':\s*([01])/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10, `GEN_FLAG_ARITY must carry the full table, parsed ${keys.length} keys`);
  const genSec = sliceBetween('§3 generator', S3, 'GENERATOR-TIME FLAGS', 'BOTH SURFACES');
  const bothSec = sliceBetween('§3 both (2)', S3, 'BOTH SURFACES', '--no-manage-dev-server (replay)');
  const advertised = new Set([...flagNames(genSec), ...flagNames(bothSec)]);
  const want = new Set(keys);
  const d = diff(advertised, want);
  assert.deepEqual(d, { missing: [], extra: [] },
    `§3 generator+both flags must equal GEN_FLAG_ARITY keys (missing from §3: ${d.missing.join(', ')}; in §3 but not GEN_FLAG_ARITY: ${d.extra.join(', ')})`);
});

test('doc-parity: every flag row is well-formed and the shared §3 flags are listed under BOTH SURFACES', () => {
  const helpBlock = sliceBetween('FLAG_HELP (3)', skill, 'const FLAG_HELP = [', '\n];');
  const rows = [...helpBlock.matchAll(/^\s*\['([a-z0-9-]+)',\s*([01]),\s*'((?:[^'\\]|\\.)*)'\],?$/gm)];
  const arityBy = new Map(rows.map((m) => [m[1], m[2]]));
  for (const m of rows) {
    const name = m[1], arity = m[2], desc = m[3];
    assert.ok(arity === '0' || arity === '1', `row ${name} must have arity 0 or 1, got ${arity}`);
    assert.ok(desc.trim().length >= 8, `row ${name} must carry a real one-line description, got ${JSON.stringify(desc)}`);
  }
  // Flags that BOTH the generator and the replay accept (same name on both
  // surfaces — the generator bakes the default, the replay overrides it at
  // run time) must sit in §3's both-surfaces block. Generator-only flags
  // (no-login, after-login, company-hub, app-name, routes) must not.
  const bothSec = sliceBetween('§3 both (3)', S3, 'BOTH SURFACES', '--no-manage-dev-server (replay)');
  const both = flagNames(bothSec);
  const shared = new Set(['base-url', 'user', 'pass', 'db-path', 'hash-routes']);
  const missingShared = [...shared].filter((n) => !both.has(n));
  assert.deepEqual(missingShared, [], `shared flags must be listed under BOTH SURFACES: missing ${missingShared.join(', ')}`);
  for (const genOnly of ['no-login', 'after-login', 'company-hub', 'app-name', 'routes'])
    assert.equal(both.has(genOnly), false, `${genOnly} is generator-only and must NOT appear under BOTH SURFACES`);
  assert.equal(both.has('param'), false, '--param is independently replay-time (FLAG_HELP) and generator-time — it is listed in both of those blocks, not BOTH SURFACES');
  assert.equal(arityBy.get('param'), '1', '--param stays a value flag (repeatable)');
});
