// Guard + coverage tests: DESTRUCTIVE regex semantics, wirePageGuards wiring,
// writeCoverage click accounting, selftest-asserted mechanisms present in source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeMockPage, loadEmbedded } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EMBEDDED = join(HERE, '.build', 'embedded.mjs');
const src = () => readFileSync(EMBEDDED, 'utf8');

test('DESTRUCTIVE is word-boundary anchored (Avoid must not match void)', async () => {
  const { DESTRUCTIVE } = await loadEmbedded();
  // 'Avoid' contains the substring 'void' but with no word boundary — the
  // v2.5 regression this guards. (v2.9.2 widened the list to include
  // 'charge', so the old 'Avoid double charge' phrase now legitimately
  // matches; use a phrase without any destructive word.)
  assert.ok(!DESTRUCTIVE.test('Avoid double counting'));
  assert.ok(DESTRUCTIVE.test('Delete invoice'));
  assert.ok(DESTRUCTIVE.test('Logout'));
  assert.ok(DESTRUCTIVE.test('Sign out'));
  assert.ok(!DESTRUCTIVE.test('Download report'));
  assert.ok(!DESTRUCTIVE.test('Approve'));
});

test('v2.9.2: DESTRUCTIVE widened — common SaaS/CRUD destructive verbs are caught', async () => {
  const { DESTRUCTIVE } = await loadEmbedded();
  for (const s of ['Cancel plan', 'Clear history', 'Empty trash', 'Refund invoice',
    'Terminate account', 'Archive project', 'Wipe data', 'Downgrade plan', 'Charge card', 'Deactivate user']) {
    assert.ok(DESTRUCTIVE.test(s), `"${s}" must be treated as destructive`);
  }
  // closeModal()'s dismiss matching is a SEPARATE literal-text code path —
  // plain 'Close'/'Dismiss' buttons must stay sweepable (not in this list),
  // and benign wording must not be collateral damage.
  assert.ok(!DESTRUCTIVE.test('Close panel'), 'Close is a dismiss word, not a destructive verb');
  assert.ok(!DESTRUCTIVE.test('Proceed'));
  assert.ok(!DESTRUCTIVE.test('Download report'));
});

test('wirePageGuards registers native dialog and popup handlers', async () => {
  const { wirePageGuards } = await loadEmbedded();
  const handlers = [];
  wirePageGuards({ on: (ev) => handlers.push(ev) });
  assert.ok(handlers.includes('dialog'), 'alert/confirm/prompt would stall the sweep unhandled');
  assert.ok(handlers.includes('popup'), 'target=_blank popups would escape the sweep context');
});

test('coverage counts every click-implying result and keeps a per-result breakdown', async () => {
  const { writeCoverage } = await loadEmbedded();
  const report = [
    { route: '/a', result: 'clicked' },
    { route: '/a', result: 'modal-opened' },
    { route: '/a', result: 'row-expanded' },
    { route: '/a', result: 'rows-revealed' },
    { route: '/a', result: 'dropdown-opened' },
    { route: '/a', result: 'details-expanded' },
    { route: '/a', result: 'navigated → /b' },
    { route: '/a', result: 'select-enumerated (3 options)' },
    { route: '/a', result: 'click-failed: timeout' },
    { route: '/a', result: 'skipped-destructive' },
  ];
  const outDir = join(HERE, '.build', 'cov');
  const { rmSync, mkdirSync, readFileSync } = await import('node:fs');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'plan/replay'), { recursive: true });
  const cwd = process.cwd();
  process.chdir(outDir);
  try { writeCoverage(report); } finally { process.chdir(cwd); }
  const cov = JSON.parse(readFileSync(join(outDir, 'plan/replay/coverage.json'), 'utf8'));
  assert.equal(cov.clicked, 8, 'v2.5 counted only 2 of these 10 as clicked');
  assert.equal(cov.failed, 1);
  assert.equal(cov['skipped-destructive'], 1);
  assert.equal(cov.byResult['modal-opened'], 1, 'byResult breakdown present');
});

test('selftest-asserted mechanisms are present in the skill source', async () => {
  const s = src();
  const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
  assert.ok(s.includes('data-replay-cid'), 'census tags elements (locator-safety mechanism)');
  assert.ok(s.includes('REFUSING TO RESTORE'), 'restore verify-guard');
  assert.ok(s.includes('slice(0, 14)'), 'backup stamp seconds precision');
  // The test module intentionally strips the MODE exit guard (it would kill
  // the runner on import), so assert it against SKILL.md itself.
  assert.ok(skill.includes("['sweep', 'scripted', 'both'].includes(MODE)"), 'MODE enum validation');
  assert.ok(s.includes('parseIntSafe'), 'NaN-safe numeric flags');
});

test('v2.7 CSP-safe cursor styles: adoptedStyleSheets with <style> fallback', async () => {
  const { CURSOR_JS } = await loadEmbedded();
  assert.ok(CURSOR_JS.includes('replay-cursor'));
  assert.ok(CURSOR_JS.includes('rc-pulse'));
  assert.ok(CURSOR_JS.includes('adoptedStyleSheets'), 'static styles must not rely on a strippable <style> injection');
  assert.ok(CURSOR_JS.includes("createElement('style')"), 'fallback path for engines without Constructable Stylesheets');
  assert.ok(!CURSOR_JS.includes('style.cssText'), 'bulk inline cssText is CSP-strippable; property assignment is not');
});

test('v2.7 nav discovery: header OR nav, badge/whitespace-tolerant anchored matching', async () => {
  const s = src();
  assert.ok(s.includes("page.locator('header, nav')"), 'bare <nav> navbars must be hoverable');
  const { navLabelRe } = await loadEmbedded();
  const re = navLabelRe('Invoices');
  assert.ok(re.test('Invoices'));
  assert.ok(re.test(' Invoices '), 'padding whitespace tolerated');
  assert.ok(re.test('Invoices 3'), 'trailing count badge tolerated');
  assert.ok(!re.test('In'), 'anchored: prefix must not match');
  assert.ok(!re.test('Invoices overdue'), 'anchored: suffix text must not match');
  assert.ok(navLabelRe('C++ & Co.').test('C++ & Co. 2'), 'regex metachars escaped');
});

test('v2.9.4: bare Cancel stays sweepable — only "Cancel <thing>" is destructive', async () => {
  const { DESTRUCTIVE } = await loadEmbedded();
  assert.ok(!DESTRUCTIVE.test('Cancel'), 'a plain dialog Cancel only dismisses (closeModal literal path) — never destructive');
  for (const s of ['Cancel plan', 'Cancel subscription', 'Cancel membership',
    'Cancel order', 'Cancel booking', 'Cancel account', 'Cancel service', 'Cancel invoice']) {
    assert.ok(DESTRUCTIVE.test(s), `"${s}" destroys something and must stay destructive`);
  }
});
