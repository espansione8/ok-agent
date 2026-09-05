// resolveParam behavioral suite (v2.9.3). Regressions being pinned:
//  - '/invoices/:id/edit' resolved from a '/invoices/42/edit' link used to
//    produce '/invoices/42/edit/edit' (static segments after a param were
//    double-pushed);
//  - '/docs/:a/view/:b' from an exact '/docs/7/view/3' link returned null
//    (interleaved statics misaligned the old tail-push);
//  - hash-SPA links ('#/docs/7/view/3') were never discovered because the
//    href scan only accepted '/' -leading hrefs.
// The scanner runs for real inside a jsdom page: resolveParam drives
// page.goto() to each candidate page and page.evaluate() runs the actual
// in-page href scanner against that page's DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { makeDom } from './harness.mjs';

// linksByRoute: { '/accounts': ['/accounts/7'] } — the hrefs rendered on the
// page whose ROUTE key (path for path apps, fragment for hash apps) matches
// the currently-navigated URL.
function makeParamPage(linksByRoute) {
  let url = 'http://localhost:5173/';
  let dom = makeDom('<!DOCTYPE html><html><body></body></html>', url);
  const keyOf = (u) => {
    const x = new URL(u);
    return x.hash && x.hash.startsWith('#/') ? x.hash.slice(1) : x.pathname;
  };
  const render = () => {
    const links = linksByRoute[keyOf(url)] ?? [];
    dom = makeDom('<!DOCTYPE html><html><body>' +
      links.map((h) => `<a href="${h}">x</a>`).join('') +
      '</body></html>', url);
  };
  render();
  return {
    url: () => url,
    async goto(u) { url = new URL(u, 'http://localhost:5173').href; render(); },
    async waitForLoadState() {},
    async waitForTimeout() {},
    async evaluate(fn, arg) {
      const ctx = dom.getInternalVMContext();
      const result = vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`, ctx);
      return JSON.parse(JSON.stringify(result ?? null));
    },
  };
}

const run = async (mod, links, route) => mod.resolveParam(makeParamPage(links), route);

test('v2.9.3: single-param route resolves from its index page', async () => {
  const mod = await import('./.build/embedded.mjs');
  assert.equal(await run(mod, { '/accounts': ['/accounts/7'] }, '/accounts/:id'), '/accounts/7');
});

test('v2.9.3: trailing static is NOT double-pushed (/invoices/:id/edit)', async () => {
  const mod = await import('./.build/embedded.mjs');
  // Link tail already contains the route's own '/edit' static — the old fill
  // pushed it AND let the loop push it again → '/invoices/42/edit/edit'.
  assert.equal(await run(mod, { '/invoices': ['/invoices/42/edit'] }, '/invoices/:id/edit'), '/invoices/42/edit');
  // Shorter link (view page, no '/edit'): the walk ends early and the loop
  // appends the trailing static — same result.
  assert.equal(await run(mod, { '/invoices': ['/invoices/42'] }, '/invoices/:id/edit'), '/invoices/42/edit');
});

test('v2.9.3: interleaved statics fill correctly (/docs/:a/view/:b)', async () => {
  const mod = await import('./.build/embedded.mjs');
  // The v2.8.1 hub claim — "a /documents/7/view/3 link matches a multi-param
  // shape in one step" — was broken for statics between params: returned null.
  assert.equal(await run(mod, { '/docs': ['/docs/7/view/3'] }, '/docs/:a/view/:b'), '/docs/7/view/3');
});

test('v2.9.3: straight multi-param route still fills in one step', async () => {
  const mod = await import('./.build/embedded.mjs');
  assert.equal(await run(mod, { '/ledger': ['/ledger/1/2'] }, '/ledger/:a/:b'), '/ledger/1/2');
});

test('v2.9.3: hub fallback resolves when the prefix page has no links', async () => {
  const mod = await import('./.build/embedded.mjs');
  // '/docs' index exists but links nothing; the '/companies' hub links the
  // full shape (HUB_ROUTES defaults to '/companies,/home' in the fixture).
  const links = { '/docs': [], '/companies': ['/docs/7/view/3'] };
  assert.equal(await run(mod, links, '/docs/:a/view/:b'), '/docs/7/view/3');
});

test('v2.9.3: shape mismatch returns null instead of fabricating a bogus URL', async () => {
  const mod = await import('./.build/embedded.mjs');
  // '/invoices/42/print' is a DIFFERENT route (a print page) — the old code
  // happily swept it under the '/invoices/:id/edit' label.
  assert.equal(await run(mod, { '/invoices': ['/invoices/42/print'] }, '/invoices/:id/edit'), null);
  // And a genuinely unresolvable route is still null, not a half-filled URL.
  assert.equal(await run(mod, {}, '/invoices/:id/edit'), null);
});

test('v2.9.3: hash-SPA links (#/route) are discovered when HASH_ROUTES', async () => {
  const hashMod = await import('./.build/embedded-hash.mjs');
  const links = { '/docs': ['#/docs/7/view/3'] };   // hash apps link the fragment
  assert.equal(await run(hashMod, links, '/docs/:a/view/:b'), '/docs/7/view/3');
});

test('v2.9.3: path apps do NOT treat #/ links as routes', async () => {
  const mod = await import('./.build/embedded.mjs');
  // Same '#/docs/...' link on a path app: the fragment isn't a route there,
  // so discovery must leave it alone (returns null, route stays unresolvable).
  assert.equal(await run(mod, { '/docs': ['#/docs/7/view/3'] }, '/docs/:a/view/:b'), null);
});
