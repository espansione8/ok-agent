// Generator end-to-end fixture test (v2.9.3). The v2.9.2 draft's fixes lived
// in SKILL.md prose only — this proves scripts/generate.mjs actually emits
// them: route groups/matchers/optional params convert to real URLs, the
// manifest carries dbKind ('sqlite-file' | 'remote' | 'unknown'), and the
// emitted replay-all.mjs contains the no-rollback gate with dbKind-specific
// messaging. Runs the real generator with spawnSync against a throwaway
// SvelteKit-shaped fixture under the OS tmpdir (no browser, no playwright).
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

const write = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

// Shared SvelteKit-ish layout exercising every A1 conversion:
//  (app) route group, [id=integer] param matcher, plain [p] param, [[p]]
//  optional param, and a +page.server.ts with actions under a group+matcher.
function makeKitFixture(root, dbModule) {
  write(root, 'package.json', JSON.stringify({ name: 'fixture-app', private: true }));
  write(root, 'src/routes/+layout.svelte', '<slot />');
  write(root, 'src/routes/(app)/dashboard/+page.svelte', '<h1>Dashboard</h1>');
  write(root, 'src/routes/(app)/invoices/[id=integer]/edit/+page.server.ts',
    "export const actions = {\n  save: async () => ({ ok: true }),\n  voidInvoice: async () => ({ ok: true }),\n};");
  write(root, 'src/routes/(app)/invoices/[id=integer]/edit/+page.svelte', '<h1>Edit invoice</h1>');
  write(root, 'src/routes/accounts/[accountId]/+page.svelte', '<h1>Account</h1>');
  write(root, 'src/routes/(public)/docs/[[page]]/+page.svelte', '<h1>Docs</h1>');
  write(root, 'src/routes/(public)/docs/[[page]]/+page.server.ts',
    "export const actions = { default: async () => ({ ok: true }) };");
  write(root, dbModule.path, dbModule.content);
}

const runGenerator = (root, extra = []) => spawnSync(NODE, [
  GENERATOR, '--no-login', '--app-name', 'fixture', '--base-url', 'http://localhost:5173', ...extra,
], { cwd: root, encoding: 'utf8' });

const localDb = { path: 'src/lib/server/db.ts', content: "import Database from 'better-sqlite3';\nexport const db = new Database('data/app.db');\n" };
const remoteDb = { path: 'src/lib/server/db.ts', content: "import { createClient } from '@libsql/client';\nexport const db = createClient({ url: 'libsql://fixture.turso.io' });\n// also exercise env-name detection:\n// TURSO_AUTH_TOKEN\n" };

test('v2.9.2/3: routes convert groups/matchers/optionals; local SQLite → sqlite-file kind', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-local-'));
  try {
    makeKitFixture(root, localDb);
    const res = runGenerator(root);
    assert.equal(res.status, 0, 'generator must succeed: ' + (res.stderr || res.stdout).slice(0, 400));
    const manifest = JSON.parse(readFileSync(join(root, 'plan/replay/manifest.json'), 'utf8'));
    const routes = manifest.routes;
    assert.ok(routes.includes('/dashboard'), 'route group (app) must be stripped: ' + JSON.stringify(routes));
    assert.ok(!routes.some((r) => r.includes('(app)') || r.includes('(public)')), 'no literal group segment may survive');
    assert.ok(routes.includes('/invoices/:id/edit'), 'matcher suffix =integer must be stripped from the param');
    assert.ok(!routes.some((r) => r.includes('=')), 'no =matcher may survive in a route');
    assert.ok(routes.includes('/accounts/:accountId'), 'plain [p] param converts');
    assert.ok(routes.includes('/docs/:page') && routes.includes('/docs'),
      'optional [[page]] registers BOTH the :page and the param-less twin: ' + JSON.stringify(routes));
    assert.equal(manifest.db.kind, 'sqlite-file', 'local sqlite file → sqlite-file');
    assert.equal(manifest.db.guess, 'data/app.db');
    // v2.9.3 dbKind visibility: printed at generation time AND baked into the
    // emitted header, so the DB situation is known before the first run.
    assert.ok(res.stdout.includes('db: sqlite-file → data/app.db'), 'generator prints the sqlite kind: ' + res.stdout);
    assert.ok(manifest.actions['/invoices/:id/edit']?.includes('save'), 'actions keyed by the URL form of a grouped/matcher route');
    // The emitted script must carry the whole v2.9.3 lifecycle: quiesce gate,
    // no-rollback gate (with dbKind messaging), gated restores, selftest pin.
    const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
    assert.ok(emitted.includes('const quiesced = await stopDevServer();'), 'emitted main() captures the stop result');
    assert.ok(emitted.includes('ABORTING before any sweep mutation'), 'quiesce gate present');
    assert.ok(emitted.includes('i-accept-no-db-rollback'), 'no-rollback gate present');
    assert.ok(emitted.includes("MANIFEST.db?.kind"), 'gate reads dbKind from the manifest');
    assert.ok(emitted.includes('const dbKind = MANIFEST.db?.kind ?? \'unknown\''), 'dbKind hoisted before the backup');
    assert.ok(emitted.includes('const stamp = backupDatabase(dbKind);'), 'backupDatabase receives dbKind for its warning');
    assert.ok(emitted.includes('const runIsInert = MODE_RUN === \'scripted\''), 'scripted inert exemption present');
    assert.ok(emitted.includes('!runIsInert && !stamp && !RESET_URL && !NO_ROLLBACK_ACK'), 'gate condition includes runIsInert');
    assert.ok(emitted.includes("if (MODE_RUN === 'scripted')"), 'scripted mode gates OUT the exhaustive route drain');
    assert.ok(emitted.includes('the exhaustive route sweep is skipped'), 'scripted-mode skip message present');
    assert.ok(emitted.includes('const stopped = await stopDevServer();') && emitted.includes('const restored = stopped && restoreDatabaseBackup(stamp);'), 'END restore gated');
    assert.ok(emitted.includes("PHASE = 'warm ' + url"), 'emitted main() runs the §6 warm-up pass before the drain');
    assert.ok(emitted.includes('main:no-rollback-gate'), 'selftest pins the gate in main()');
    assert.ok(emitted.includes('main:scripted-inert-exemption') && emitted.includes('backup:dbKind-aware-warning'), 'selftest pins the v2.9.3 additions');
    assert.ok(emitted.includes('teardown:watchdog-race') && emitted.includes('destructive:bare-cancel-must-stay-sweepable'), 'selftest pins the v2.9.4 additions');
    assert.ok(emitted.includes('// DB: sqlite-file → data/app.db'), 'emitted header carries the DB kind line');
    const chk = spawnSync(NODE, ['--check', join(root, 'plan/replay/replay-all.mjs')], { encoding: 'utf8' });
    assert.equal(chk.status, 0, 'emitted script must parse: ' + chk.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The emitted script imports playwright at the top; the fixture dir has no
// real install, so selftest needs a stub that satisfies the import. selftest()
// never launches a browser (it returns before chromium.launch), so a null
// chromium export is all the stub needs.
function writePlaywrightStub(root) {
  const dir = join(root, 'node_modules', 'playwright');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'playwright', version: '0.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), 'export const chromium = null;\n');
}

test('v2.9.3: emitted replay-all.mjs --selftest runs and prints PASS (end-to-end artifact)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-selftest-'));
  try {
    makeKitFixture(root, localDb);
    const res = runGenerator(root);
    assert.equal(res.status, 0, 'generator must succeed: ' + (res.stderr || res.stdout).slice(0, 400));
    writePlaywrightStub(root);
    const run = spawnSync(NODE, [join(root, 'plan/replay/replay-all.mjs'), '--selftest'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, 'emitted --selftest must pass: ' + (run.stdout || run.stderr).slice(0, 600));
    assert.ok(run.stdout.includes('✓ SELFTEST PASS'), 'must print PASS, got: ' + run.stdout.slice(0, 600));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.2/3: Turso/libSQL source → dbKind remote with a null guess (no file to snapshot)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-remote-'));
  try {
    makeKitFixture(root, remoteDb);
    const res = runGenerator(root);
    assert.equal(res.status, 0, 'generator must succeed: ' + (res.stderr || res.stdout).slice(0, 400));
    const manifest = JSON.parse(readFileSync(join(root, 'plan/replay/manifest.json'), 'utf8'));
    assert.equal(manifest.db.kind, 'remote', 'libsql/Turso source → remote, not a silent miss');
    assert.equal(manifest.db.guess, null, 'no local sqlite file exists to snapshot');
    const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
    // The gate message must be the dbKind-SPECIFIC one for remote DBs — the
    // changelog promise the v2.9.2 draft never wired up.
    assert.ok(emitted.includes("the app's database is remote/non-file"), 'remote-specific abort message emitted');
    // v2.9.3 dbKind visibility: a REMOTE app is flagged at generation time
    // and in the emitted header — not only when the gate fires mid-run.
    assert.ok(res.stdout.includes('⚠ db: REMOTE'), 'generator flags the remote DB loudly: ' + res.stdout);
    assert.ok(emitted.includes('// ⚠ DB: REMOTE'), 'emitted header carries the ⚠ REMOTE line');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.3: strict CLI — unknown flags, --project, positionals and missing values exit 2 in generator AND emitted replay', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-strict-'));
  try {
    makeKitFixture(root, localDb);
    // Generator side — every case must hard-fail with exit 2, never silently
    // fall through to the default scan (the stale --project trap).
    for (const [extra, needle] of [
      [['--project', 'foo'], '--project was REMOVED'],
      [['--frobnicate'], 'unknown flag --frobnicate'],
      [['stray'], 'unexpected positional argument'],
      [['--db-path'], 'needs a value'],
      [['--nav-tree-legacy'], '--nav-tree-legacy was REMOVED'],
    ]) {
      const res = runGenerator(root, extra);
      assert.equal(res.status, 2, `${extra.join(' ')} must exit 2, got ${res.status}: ${(res.stdout + res.stderr).slice(0, 300)}`);
      assert.ok((res.stdout + res.stderr).includes(needle), `${extra.join(' ')} must name the problem: ${(res.stdout + res.stderr).slice(0, 300)}`);
    }
    // Replay side — the generated script must reject the same shapes.
    const gen = runGenerator(root);
    assert.equal(gen.status, 0, 'generator must succeed first: ' + (gen.stderr || gen.stdout).slice(0, 300));
    writePlaywrightStub(root);
    const replay = join(root, 'plan/replay/replay-all.mjs');
    for (const [extra, needle] of [
      [['--project', 'x'], '--project was REMOVED'],
      [['--frobnicate'], 'unknown flag --frobnicate'],
      [['stray'], 'unexpected positional argument'],
      [['--mode'], 'needs a value'],
    ]) {
      const run = spawnSync(NODE, [replay, ...extra], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `replay ${extra.join(' ')} must exit 2, got ${run.status}: ${(run.stdout || run.stderr).slice(0, 300)}`);
      assert.ok((run.stdout + run.stderr).includes(needle), `replay ${extra.join(' ')} must name the problem: ${(run.stdout + run.stderr).slice(0, 300)}`);
    }
    // Generator --help: exit 0 with full usage, wins over unknown flags, and
    // works from outside an app dir. Its usage rows must name EXACTLY the
    // GEN_FLAG_ARITY keys — the text table and the validator cannot drift.
    const usage = runGenerator(root, ['--help']);
    assert.equal(usage.status, 0, 'generator --help must exit 0: ' + (usage.stdout + usage.stderr).slice(0, 300));
    for (const needle of ['svelte-replay generator', 'Options:', '--base-url URL', '--hash-routes', '--no-login',
      '--company-hub PATH', '--routes /a,/b/:id', '--app-name NAME', '--project (removed']) {
      assert.ok(usage.stdout.includes(needle), `generator usage must mention ${needle}: ${usage.stdout.slice(0, 800)}`);
    }
    const optsBlock = usage.stdout.slice(usage.stdout.indexOf('Options:'), usage.stdout.indexOf('Unknown flags'));
    const genRows = [...optsBlock.matchAll(/--([a-z0-9-]+)/g)].map((m) => m[1]);
    const genExpected = ['help', 'no-login', 'hash-routes', 'base-url', 'user', 'pass', 'db-path',
      'after-login', 'company-hub', 'app-name', 'routes', 'param'].sort();
    assert.deepEqual([...new Set(genRows)].sort(), genExpected,
      'generator usage Options block must name exactly the GEN_FLAG_ARITY keys (no drift): ' + JSON.stringify([...new Set(genRows)]));
    const win = runGenerator(root, ['--help', '--frobnicate']);
    assert.equal(win.status, 0, 'generator --help must win over unknown flags: ' + (win.stdout + win.stderr).slice(0, 300));
    assert.ok(win.stdout.includes('Options:'), 'usage printed when --help wins: ' + win.stdout.slice(0, 300));
    const noApp = mkdtempSync(join(tmpdir(), 'sr-gen-noapp-'));
    try {
      const fromNoApp = spawnSync(NODE, [GENERATOR, '--help'], { cwd: noApp, encoding: 'utf8' });
      assert.equal(fromNoApp.status, 0, 'generator --help must exit 0 even outside an app dir: ' + (fromNoApp.stdout + fromNoApp.stderr).slice(0, 300));
    } finally {
      rmSync(noApp, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// v2.9.4 NAV_TREE parents: three GENERIC menu patterns (no single-app markup
// assumed) — native <details><summary>, dropdown menu (label + a
// .dropdown-content link list), nested <li>Label<ul>. The dropdown hover loop
// and nav() parent-hover only run when these keys exist, so assert them on
// real generator output, not a hand-made fixture.
function makeNavFixture(root) {
  write(root, 'package.json', JSON.stringify({ name: 'nav-fixture-app', private: true }));
  write(root, 'src/routes/+layout.svelte', '<slot />');
  write(root, 'src/routes/+page.svelte', '<h1>Home</h1>');
  write(root, 'src/routes/dashboard/+page.svelte', '<h1>Dashboard</h1>');
  write(root, 'src/lib/Header.svelte', `<header><nav>
  <a href="/dashboard">Dashboard</a>
  <details><summary>Reports</summary>
    <a href="/reports/summary">Summary</a>
    <a href="/reports/custom">Custom</a>
  </details>
  <div class="dropdown">
    <div tabindex="0" role="button">Invoices</div>
    <ul tabindex="0" class="dropdown-content menu">
      <li><a href="/invoices">All invoices</a></li>
      <li><a href="/invoices/new">New invoice</a></li>
    </ul>
  </div>
  <ul><li>Admin<ul><li><a href="/admin/users">Users</a></li></ul></li></ul>
</nav></header>`);
}

const readNavTree = (root) => {
  const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
  const m = emitted.match(/const NAV_TREE = (\{[\s\S]*?\});\s*\nconst PARTS/);
  assert.ok(m, 'emitted script must bake a NAV_TREE const before PARTS');
  return JSON.parse(m[1]);
};

test('v2.9.4: NAV_TREE carries parent groups from generic menu patterns', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-nav-'));
  try {
    makeNavFixture(root);
    const res = runGenerator(root);
    assert.equal(res.status, 0, 'generator must succeed: ' + (res.stderr || res.stdout).slice(0, 400));
    const nav = readNavTree(root);
    assert.deepEqual(nav.Reports?.map((l) => l.href).sort(), ['/reports/custom', '/reports/summary'], 'details/summary group: ' + JSON.stringify(nav.Reports));
    assert.deepEqual(nav.Invoices?.map((l) => l.href).sort(), ['/invoices', '/invoices/new'], 'dropdown-content group: ' + JSON.stringify(nav.Invoices));
    assert.deepEqual(nav.Admin?.map((l) => l.href), ['/admin/users'], 'nested-ul group: ' + JSON.stringify(nav.Admin));
    const top = nav[''].map((l) => l.href);
    for (const href of ['/dashboard', '/reports/summary', '/invoices', '/admin/users'])
      assert.ok(top.includes(href), `top-level links still collected (${href}): ` + JSON.stringify(top));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.4: scan-time --param bakes into manifest.params; bare --param exits 2', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-param-'));
  try {
    makeKitFixture(root, localDb);
    const res = runGenerator(root, ['--param', 'accountId=42']);
    assert.equal(res.status, 0, 'generator must succeed: ' + (res.stderr || res.stdout).slice(0, 400));
    const manifest = JSON.parse(readFileSync(join(root, 'plan/replay/manifest.json'), 'utf8'));
    assert.equal(manifest.params?.accountId, '42', 'scan-time --param must survive in the manifest: ' + JSON.stringify(manifest.params));
    const emitted = readFileSync(join(root, 'plan/replay/replay-all.mjs'), 'utf8');
    assert.ok(emitted.includes('MANIFEST.params'), 'emitted PARAM_OVERRIDES must seed from the baked manifest params');
    const bad = runGenerator(root, ['--param', 'bare']);
    assert.equal(bad.status, 2, 'bare --param must exit 2, got ' + bad.status);
    assert.ok((bad.stdout + bad.stderr).includes('expected name=value'), 'must name the problem: ' + (bad.stdout + bad.stderr).slice(0, 300));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v2.9.4: strict numerics + route shapes exit nonzero (generator AND replay)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-gen-shapes-'));
  try {
    makeKitFixture(root, localDb);
    for (const [extra, needle] of [
      [['--routes', 'no-leading-slash'], '--routes must be an app route'],
      [['--company-hub', 'C:/mangled'], '--company-hub must be an app route'],
    ]) {
      const res = runGenerator(root, extra);
      assert.notEqual(res.status, 0, `${extra.join(' ')} must fail, got ${res.status}`);
      assert.ok((res.stdout + res.stderr).includes(needle), `${extra.join(' ')} must name the problem: ${(res.stdout + res.stderr).slice(0, 300)}`);
    }
    const gen = runGenerator(root);
    assert.equal(gen.status, 0, 'generator must succeed first: ' + (gen.stderr || gen.stdout).slice(0, 300));
    writePlaywrightStub(root);
    const replay = join(root, 'plan/replay/replay-all.mjs');
    for (const [extra, needle] of [
      [['--from', 'abc'], 'invalid --from'],
      [['--until', 'abc'], 'invalid --until'],
      [['--max-clicks', 'abc'], 'invalid --max-clicks'],
      [['--param', 'bare'], 'invalid --param'],
      [['--reset-url', 'C:/mangled'], 'invalid --reset-url'],
    ]) {
      const run = spawnSync(NODE, [replay, ...extra], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `replay ${extra.join(' ')} must exit 2, got ${run.status}: ${(run.stdout || run.stderr).slice(0, 300)}`);
      assert.ok((run.stdout + run.stderr).includes(needle), `replay ${extra.join(' ')} must name the problem: ${(run.stdout + run.stderr).slice(0, 300)}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
