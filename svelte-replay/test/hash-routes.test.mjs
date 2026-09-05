// v2.9 hash-SPA adapter tests: toAppUrl/toDocUrl semantics and hash-aware
// fingerprint route identity. The extractor emits TWO builds of the embedded
// code — the natural one (HASH_ROUTES=false, path apps) and one with the flag
// forced true (hash SPAs) — because HASH_ROUTES is a load-time const captured
// by the helpers' closures, so polarity can't be flipped at runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

const mod = await loadEmbedded();               // HASH_ROUTES = false (default)
const hashMod = await import('./.build/embedded-hash.mjs'); // HASH_ROUTES = true

test('toAppUrl is identity for path-routed apps (HASH_ROUTES=false)', () => {
  assert.equal(mod.toAppUrl('/tasks/open'), '/tasks/open');
  assert.equal(mod.toAppUrl('/'), '/');
  assert.equal(mod.toAppUrl(''), '');
  assert.equal(mod.toDocUrl('/x'), '/x');
  assert.equal(mod.toDocUrl('#/x'), '/x'); // still strips a stray fragment
});

test('toAppUrl prefixes # for hash SPAs; idempotent on pre-hashed input', () => {
  assert.equal(hashMod.toAppUrl('/tasks/open'), '#/tasks/open');
  assert.equal(hashMod.toAppUrl('#/tasks/open'), '#/tasks/open');
  assert.equal(hashMod.toAppUrl('/'), '#/');
  assert.equal(hashMod.toAppUrl(''), '#');
});

test('toDocUrl strips the fragment for hash SPAs (goBack/document-URL semantics)', () => {
  assert.equal(hashMod.toDocUrl('#/tasks/open'), '/tasks/open');
  assert.equal(hashMod.toDocUrl('/tasks/open'), '/tasks/open');
});

test('fingerprint route identity: hash apps include the fragment, path apps do not', async () => {
  // fingerprint() = page.evaluate(fn, HASH_ROUTES); drive the same predicate
  // through the mock page against a DOM whose location is a hash-SPA URL.
  const dom = makeDom('<!DOCTYPE html><html><body><button id="b">go</button></body></html>',
    'http://localhost:5199/#/tasks');
  const page = makeMockPage(dom);

  const pathFp = await mod.fingerprint(page);
  assert.equal(pathFp.url, '/');               // fragment ignored on path apps

  const hashFp = await hashMod.fingerprint(page);
  assert.equal(hashFp.url, '/#/tasks');        // fragment IS the route on hash apps
});

test('v2.9.3: fp-shaped urls normalize — no double hash when fed back through toAppUrl', () => {
  // fingerprint()'s hash-mode url is '/#/tasks' (document pathname + fragment).
  // v2.9.2 queued it verbatim and toAppUrl('/#/tasks') emitted '#/#/tasks' —
  // a fragment the router reads as '/#/tasks', which renders nothing. The
  // route IS the fragment: doc-shaped strings must normalize to a plain route
  // and rebuild to a clean single-'#' document fragment.
  assert.equal(hashMod.toDocUrl('/#/tasks'), '/tasks');
  assert.equal(hashMod.toAppUrl('/#/tasks'), '#/tasks');
  assert.equal(hashMod.toAppUrl(hashMod.toDocUrl('/#/tasks')), '#/tasks');
  assert.equal(hashMod.toDocUrl('/#/invoices/42/edit'), '/invoices/42/edit');
  assert.equal(hashMod.toAppUrl('/#/invoices/42/edit'), '#/invoices/42/edit');
  // Route-shaped inputs still round-trip (idempotency preserved).
  assert.equal(hashMod.toAppUrl('/tasks/open'), '#/tasks/open');
  assert.equal(hashMod.toAppUrl('#/tasks/open'), '#/tasks/open');
  assert.equal(hashMod.toAppUrl('/'), '#/');
  assert.equal(hashMod.toAppUrl(''), '#');
  assert.equal(hashMod.toDocUrl(''), '');
});

test('v2.9.3: path polarity unaffected — fragment-free urls pass through untouched', () => {
  // fp urls in path mode are pathname+search and never carry a fragment, so
  // both helpers stay identity there (a bare '#anchor' scroll must not become
  // navigation, and queue entries must not be rewritten).
  assert.equal(mod.toDocUrl('/tasks?page=2'), '/tasks?page=2');
  assert.equal(mod.toDocUrl('/'), '/');
  assert.equal(mod.toAppUrl('/tasks'), '/tasks');
  assert.equal(mod.toDocUrl('#/x'), '/x', 'a stray leading fragment still strips');
});
