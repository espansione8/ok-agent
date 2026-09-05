// No-browser MODE-gate harness (v2.9.3). The previous proof that
// `--mode scripted` skips the exhaustive route sweep was a SOURCE substring
// check on the emitted script; this test DRIVES the emitted main() end to end
// and observes the behavior: the generated replay-all.mjs runs as a real
// subprocess against a playwright import stub whose page records every
// page.goto to stdout (STUB-GOTO <url>). No browser, no dev server, no DB,
// no manifest-side effects beyond the coverage files main() writes.
//
//   --mode scripted → must reach the END (coverage written) with ZERO route
//     gotos and WITHOUT --i-accept-no-db-rollback (authored PARTS-only runs
//     are the runIsInert exemption — they never drain the queue).
//   --mode both     → must visit every static route TWICE: once in the §6
//     warm-up pass ([warm] gotos, pre-triggering cold SSR compiles) and once
//     in the sweep drain (sweepRoute's first act is page.goto(route)).
//
// Any regression that re-drains the queue under scripted (or gates the
// warm-up/drain away under both) fails on the goto log, not on a grep of
// main()'s source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR = join(HERE, '..', 'scripts', 'generate.mjs');
const NODE = process.execPath;
const BASE = 'http://localhost:5173';

const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

// Three static routes, no login flow, no DB file: a minimal SvelteKit app
// whose sweep is observable purely through the goto log.
function makeFixture(root) {
  write(root, 'package.json', JSON.stringify({ name: 'mode-gate-app', private: true }));
  write(root, 'src/routes/+layout.svelte', '<slot />');
  for (const r of ['dashboard', 'invoices', 'accounts'])
    write(root, `src/routes/${r}/+page.svelte`, `<h1>${r}</h1>`);
}

// A page stub that survives main()'s zero-element run: census() expects a
// canned { list: [], issued: 0 } from page.evaluate; every route sweep calls
// goto → waitForLoadState → waitForTimeout → census → (nothing). Everything
// else (on/close/locator/keyboard/mouse) exists so no call throws.
function writePlaywrightStub(root) {
  const dir = join(root, 'node_modules', 'playwright');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'playwright', version: '0.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), `export const chromium = {
  async launch() {
    const page = {
      _url: '${BASE}/',
      url() { return this._url; },
      async goto(u) { this._url = String(u); console.log('STUB-GOTO ' + u); },
      on() {},
      async evaluate() { return { list: [], issued: 0 }; },   // census contract
      async waitForLoadState() {}, async waitForTimeout() {}, async waitForURL() {},
      async waitForFunction() {}, async screenshot() {},
      locator() { return { count: async () => 0, isVisible: async () => false, click: async () => {}, first: () => null, all: async () => [] }; },
      keyboard: { press: async () => {}, type: async () => {} },
      mouse: { move: async () => {}, click: async () => {} },
    };
    return {
      async newContext() {
        return {
          async addInitScript() {},
          async newPage() { return page; },
        };
      },
      async close() {},
    };
  },
};
`);
}

const runReplay = (root, args) => spawnSync(NODE, [join(root, 'plan/replay/replay-all.mjs'), ...args], {
  cwd: root, encoding: 'utf8', timeout: 60000,
});

test('v2.9.3: mode gate drives the emitted main() — scripted skips the route sweep, both drains it', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-modegate-'));
  try {
    makeFixture(root);
    writePlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'modegate', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));

    const routes = ['/dashboard', '/invoices', '/accounts'];
    const expected = new Set(routes.map((r) => BASE + r));

    // --- scripted: authored PARTS only, zero route gotos, NO ack flag needed
    const scripted = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted']);
    assert.equal(scripted.status, 0, 'scripted run must exit 0: ' + (scripted.stdout + scripted.stderr).slice(0, 600));
    assert.ok(scripted.stdout.includes('authored PARTS only'),
      'scripted must announce the skip: ' + scripted.stdout.slice(0, 600));
    assert.ok(scripted.stdout.includes('coverage written'),
      'scripted must reach the END (PARTS-only run completes): ' + scripted.stdout.slice(0, 600));
    const scriptedGot = (scripted.stdout.match(/STUB-GOTO /g) ?? []).length;
    assert.equal(scriptedGot, 0, `scripted must make ZERO route gotos, got ${scriptedGot}: ${scripted.stdout.slice(0, 600)}`);
    assert.ok(!/i-accept-no-db-rollback/.test(scripted.stdout + scripted.stderr),
      'scripted must NOT require the no-rollback ack (runIsInert exemption): ' + (scripted.stdout + scripted.stderr).slice(0, 600));

    // --- both: warm-up (§6) + the exhaustive drain — every static route is
    // visited TWICE (once to pre-trigger the SSR compile, once by the sweep)
    const both = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'both', '--i-accept-no-db-rollback']);
    assert.equal(both.status, 0, 'both run must exit 0: ' + (both.stdout + both.stderr).slice(0, 800));
    assert.ok(both.stdout.includes('route queue: 3 route(s)'),
      'both must build the full queue: ' + both.stdout.slice(0, 600));
    const gotos = (both.stdout.match(/STUB-GOTO ([^\s]+)/g) ?? []).map((s) => s.replace('STUB-GOTO ', ''));
    assert.equal(gotos.length, routes.length * 2,
      `both must warm + drain each queued route (${routes.length * 2} gotos), got ${gotos.length}: ${both.stdout.slice(0, 800)}`);
    assert.deepEqual(new Set(gotos), expected,
      `both must visit exactly the queued routes, nothing else: ${JSON.stringify(gotos)}`);
    const warm = (both.stdout.match(/\[warm\] /g) ?? []).length;
    assert.equal(warm, routes.length,
      `both must print one [warm] line per route (warm-up ran), got ${warm}: ${both.stdout.slice(0, 800)}`);
    assert.ok(both.stdout.includes('coverage written'), 'both must finish normally: ' + both.stdout.slice(0, 600));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.3: replay --help prints the full flag table + gates and exits 0 (help wins)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-modegate-help-'));
  try {
    makeFixture(root);
    writePlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'modegate', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));
    const help = runReplay(root, ['--help']);
    assert.equal(help.status, 0, '--help must exit 0: ' + (help.stdout + help.stderr).slice(0, 600));
    for (const needle of ['Usage: node replay-all.mjs', '--mode <value>', '--i-accept-no-db-rollback',
      '--no-manage-dev-server', 'Three gates', 'node --check plan/replay/replay-all.mjs', '--selftest', '--headless --mode sweep --max-clicks 20']) {
      assert.ok(help.stdout.includes(needle), `--help must mention ${needle}: ${help.stdout.slice(0, 1200)}`);
    }
    // Help text and validator share FLAG_HELP, so every arity the validator
    // accepts must appear as a --flag row in the output.
    const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
    const rows = help.stdout.match(/^  --[a-z0-9-]+/gm) ?? [];
    const names = rows.map((r) => r.trim().slice(2).replace(/ .*/, ''));
    assert.ok(emitted.includes('FLAG_HELP.map'), 'help must be generated from the shared FLAG_HELP table');
    const flagCount = (emitted.match(/^  \['[a-z0-9-]+', [01],/gm) ?? []).length;
    assert.equal(names.length, flagCount,
      `help must list exactly the FLAG_HELP rows (${flagCount}), got ${names.length} — the table and the printed list share one source`);
    // --help wins even next to an unknown flag.
    const win = runReplay(root, ['--help', '--frobnicate']);
    assert.equal(win.status, 0, '--help must win over an unknown flag: ' + (win.stdout + win.stderr).slice(0, 400));
    assert.ok(win.stdout.includes('Three gates'), 'help still printed: ' + win.stdout.slice(0, 400));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.3: PARTS slicing through the emitted main() — sweep warms+drains with ZERO parts, scripted runs exactly PARTS.slice(FROM, UNTIL)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-parts-'));
  try {
    makeFixture(root);
    writePlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'parts', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));
    // Inject five hand-authored PARTS steps into the emitted script (the
    // generated PARTS array is empty by design; each step prints PART-RAN i).
    const emittedPath = join(root, 'plan/replay/replay-all.mjs');
    const src = readFileSync(emittedPath, 'utf8');
    const partsJs = 'const PARTS = [\n' +
      Array.from({ length: 5 }, (_, i) => `  async () => { console.log('PART-RAN ${i}'); },`).join('\n') +
      '\n];';
    assert.ok(src.includes('const PARTS = [];'), 'emitted PARTS array must be replaceable');
    writeFileSync(emittedPath, src.replace('const PARTS = [];', partsJs));
    const partsRan = (out) => [...out.matchAll(/PART-RAN (\d)/g)].map((m) => Number(m[1]));
    const gotos = (out) => (out.match(/STUB-GOTO /g) ?? []).length;

    // --- --mode sweep: warm-up + drain run, hand-authored PARTS are NOT run
    const sweep = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'sweep', '--i-accept-no-db-rollback']);
    assert.equal(sweep.status, 0, 'sweep must exit 0: ' + (sweep.stdout + sweep.stderr).slice(0, 800));
    assert.ok(sweep.stdout.includes('route queue: 3 route(s)'), 'sweep drains the queue: ' + sweep.stdout.slice(0, 600));
    assert.equal((sweep.stdout.match(/\[warm\] /g) ?? []).length, 3, 'sweep must run the warm-up pass');
    assert.equal(gotos(sweep.stdout), 6, `sweep must warm + drain each route (6 gotos), got ${gotos(sweep.stdout)}`);
    assert.deepEqual(partsRan(sweep.stdout), [], 'MODE sweep must NOT run hand-authored PARTS');

    // --- --mode scripted (no --from/--until): every part, zero route gotos
    const all = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted']);
    assert.equal(all.status, 0, 'scripted must exit 0: ' + (all.stdout + all.stderr).slice(0, 800));
    assert.deepEqual(partsRan(all.stdout), [0, 1, 2, 3, 4], 'scripted must run all PARTS in order');
    assert.equal(gotos(all.stdout), 0, 'scripted must make ZERO route gotos (no warm-up, no drain)');

    // --- --mode scripted --from 1 --until 3: exactly PARTS.slice(1, 3)
    const slice = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted', '--from', '1', '--until', '3']);
    assert.equal(slice.status, 0, 'sliced scripted must exit 0: ' + (slice.stdout + slice.stderr).slice(0, 800));
    assert.deepEqual(partsRan(slice.stdout), [1, 2], '--from 1 --until 3 must run exactly parts 1 and 2 (until is exclusive)');
    assert.equal(gotos(slice.stdout), 0, 'sliced scripted must make ZERO route gotos');

    // --- --mode scripted --from 2 (no --until): parts 2..4, until defaults to PARTS.length
    const from = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted', '--from', '2']);
    assert.equal(from.status, 0, 'from-only scripted must exit 0: ' + (from.stdout + from.stderr).slice(0, 800));
    assert.deepEqual(partsRan(from.stdout), [2, 3, 4], '--from 2 with no --until must run parts 2..4 (default until = PARTS.length)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.3: emitted replay-all.mjs parses with the strict CLI validator (selftest still PASS)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-modegate-strict-'));
  try {
    makeFixture(root);
    writePlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'modegate', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));
    const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
    assert.ok(emitted.includes('FLAG_ARITY'), 'strict CLI validator must be embedded in the emitted script');
    const chk = spawnSync(NODE, ['--check', join(root, 'plan/replay/replay-all.mjs')], { encoding: 'utf8' });
    assert.equal(chk.status, 0, 'emitted script must parse: ' + chk.stderr);
    const selftest = runReplay(root, ['--selftest']);
    assert.equal(selftest.status, 0, 'selftest must pass: ' + (selftest.stdout + selftest.stderr).slice(0, 600));
    assert.ok(selftest.stdout.includes('✓ SELFTEST PASS'), selftest.stdout.slice(0, 600));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.4: --until 0 runs zero PARTS (0 is honored, not "all")', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-until0-'));
  try {
    makeFixture(root);
    writePlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'until0', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));
    const emittedPath = join(root, 'plan/replay/replay-all.mjs');
    const src = readFileSync(emittedPath, 'utf8');
    const partsJs = 'const PARTS = [\n' +
      Array.from({ length: 3 }, (_, i) => `  async () => { console.log('PART-RAN ${i}'); },`).join('\n') +
      '\n];';
    assert.ok(src.includes('const PARTS = [];'), 'emitted PARTS array must be replaceable');
    writeFileSync(emittedPath, src.replace('const PARTS = [];', partsJs));
    const ran = (out) => out.match(/PART-RAN /g) ?? [];
    const zero = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted', '--until', '0']);
    assert.equal(zero.status, 0, '--until 0 must exit 0: ' + (zero.stdout + zero.stderr).slice(0, 600));
    assert.equal(ran(zero.stdout).length, 0, '--until 0 must run ZERO parts (v2.9.3 ran all): ' + zero.stdout.slice(0, 400));
    const bad = runReplay(root, ['--no-manage-dev-server', '--headless', '--mode', 'scripted', '--until', 'abc']);
    assert.equal(bad.status, 2, '--until abc must exit 2, got ' + bad.status);
    assert.ok((bad.stdout + bad.stderr).includes('invalid --until'), 'must name the problem: ' + (bad.stdout + bad.stderr).slice(0, 300));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
