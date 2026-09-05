// Coverage-artifact E2E test (v2.9.3). §8 says coverage.md's Failed/skipped
// section lists ONLY click-failed and skipped-destructive records (as
// `route | selector | text | result`), while every other result kind (clicked,
// navigated, modal-opened, …) lives in coverage.json's records + byResult.
// This test PROVES that split by driving the emitted main() against a REAL
// JSDOM-backed page (the repo's test/harness.mjs mock, imported by the
// playwright stub) so census/probe run against actual DOM and produce real
// records: a safe "Save draft" button (clicked) and a "Void all invoices"
// button (skipped-destructive) on each of three routes.
//
// No browser, no dev server: the same flags as the mode-gate harness
// (--no-manage-dev-server + --i-accept-no-db-rollback), with a local SQLite
// fixture absent so the DB bracket is inert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// One shared JSDOM document for every navigation (the mock tracks the URL via
// history.pushState, exactly like the harness SPA simulation). Two buttons:
// one safe, one destructive-worded.
const PAGE_HTML = '<h1>Fixture</h1><button id="save">Save draft</button><button id="void">Void all invoices</button>';

// The playwright stub imports the repo's own JSDOM harness by absolute file
// URL, so the emitted replay script runs census()/probe() against REAL DOM
// semantics (element tagging, visibility, exact-text recovery) — not canned
// results.
function writeDomPlaywrightStub(root) {
  const harnessUrl = pathToFileURL(join(HERE, 'harness.mjs')).href;
  const dir = join(root, 'node_modules', 'playwright');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'playwright', version: '0.0.0', type: 'module', main: 'index.js' }));
  const content = [
    `import { makeDom, makeMockPage } from ${JSON.stringify(harnessUrl)};`,
    `const dom = makeDom(${JSON.stringify(PAGE_HTML)}, ${JSON.stringify(BASE + '/')});`,
    'const page = makeMockPage(dom, {});',
    'export const chromium = {',
    '  async launch() {',
    '    return {',
    '      async newContext() { return { async addInitScript() {}, async newPage() { return page; } }; },',
    '      async close() {},',
    '    };',
    '  },',
    '};',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'index.js'), content);
}

function makeFixture(root) {
  write(root, 'package.json', JSON.stringify({ name: 'coverage-e2e-app', private: true }));
  write(root, 'src/routes/+layout.svelte', '<slot />');
  for (const r of ['dashboard', 'invoices', 'accounts'])
    write(root, `src/routes/${r}/+page.svelte`, `<h1>${r}</h1>`);
}

test('v2.9.3: coverage artifacts match §8 — clicked lives in coverage.json only, skipped-destructive in coverage.json AND coverage.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-cov-e2e-'));
  try {
    makeFixture(root);
    writeDomPlaywrightStub(root);
    const gen = spawnSync(NODE, [
      GENERATOR, '--no-login', '--app-name', 'cov', '--base-url', BASE,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator must succeed: ' + (gen.stderr || gen.stdout).slice(0, 400));
    const run = spawnSync(NODE, [join(root, 'plan/replay/replay-all.mjs'),
      '--no-manage-dev-server', '--headless', '--mode', 'sweep', '--i-accept-no-db-rollback'],
    { cwd: root, encoding: 'utf8', timeout: 90000 });
    assert.equal(run.status, 0, 'sweep must exit 0: ' + (run.stdout + run.stderr).slice(0, 1200));

    const covPath = join(root, 'plan/replay/coverage.json');
    const mdPath = join(root, 'plan/replay/coverage.md');
    const json = JSON.parse(readFileSync(covPath, 'utf8'));
    const md = readFileSync(mdPath, 'utf8');

    // Real DOM sweep: 3 routes × (Save draft → clicked, Void → skipped).
    assert.equal(json.routes, 3, 'three routes swept: ' + JSON.stringify(json));
    assert.equal(json.records.length, 6, `exactly 2 records per route, got ${json.records.length}`);
    const clicked = json.records.filter((r) => r.result === 'clicked');
    const destructive = json.records.filter((r) => r.result === 'skipped-destructive');
    assert.equal(clicked.length, 3, 'one Save draft click per route: ' + JSON.stringify(json.records));
    assert.equal(destructive.length, 3, 'one Void-all-invoices skip per route: ' + JSON.stringify(json.records));
    assert.equal(json.byResult.clicked, 3, 'byResult counts clicked');
    assert.equal(json.byResult['skipped-destructive'], 3, 'byResult counts skipped-destructive');
    assert.equal(json.failed, 0, 'no click failures on a stable page');

    // §8 coverage.md contract: the Failed/skipped section (AFTER the stats
    // block — the stats themselves also contain the word skipped-destructive)
    // lists the skipped-destructive rows as route | selector | text | result…
    assert.ok(md.includes('## Failed / skipped'), 'coverage.md has the Failed/skipped section');
    const failedSec = md.slice(md.indexOf('## Failed / skipped'));
    const mdDestructive = failedSec.split('\n').filter((l) => l.includes('skipped-destructive'));
    assert.equal(mdDestructive.length, 3, `all 3 skipped-destructive rows listed, got ${mdDestructive.length}: ${md}`);
    for (const line of mdDestructive) {
      assert.ok(/^- \S+ \| button:not\(\[disabled\]\) \| Void all invoices \| skipped-destructive$/.test(line),
        `row must be "- route | selector | text | result": ${line}`);
    }
    // …and NOT the clicked records: clicked lives in coverage.json only.
    assert.ok(!md.includes('Save draft'), 'clicked rows must NOT appear in the markdown Failed/skipped list');
    assert.ok(md.includes('clicked: 3'), 'byResult breakdown in coverage.md covers every kind: ' + md);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
