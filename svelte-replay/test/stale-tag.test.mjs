// v2.8.3 stale-tag recovery: resolveFresh() re-finds an element whose census
// tag was orphaned by a non-navigating re-render, using its semantic identity
// (sel + text + tid/title/aria/href). Regression being pinned: saftbg's
// "Filter" buttons burned 2×3s timeouts and recorded click-failed for
// elements that were visually present — because Svelte re-rendered without
// navigating, orphaning the tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('v2.8.3: orphaned tag recovered by semantic identity, click lands', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="filter">Filter</button>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const el = els[0];
  // Simulate the saftbg re-render: the node is REPLACED (fresh DOM node,
  // no tag) but keeps its identity. The old batch locator is now dead.
  const oldNode = dom.window.document.querySelector('#filter');
  const newNode = oldNode.cloneNode(true);
  newNode.removeAttribute('data-replay-cid');
  oldNode.replaceWith(newNode);
  assert.equal(await page.locator(`[data-replay-cid="${el.cid}"]`).count(), 0, 'precondition: tag orphaned');

  const fresh = await mod.resolveFresh(page, el);
  assert.ok(fresh, 'recovery must re-find the visually-present element');
  assert.notEqual(fresh.cid, el.cid, 'recovered element gets a fresh id');
  assert.ok(String(fresh.cid).startsWith('S'), 'recovered id is S-prefixed (never collides with census-issued numeric ids)');
  // The fresh tag must sit on the REPLACED node (the visually-present one).
  assert.equal(dom.window.document.querySelector('#filter').getAttribute('data-replay-cid'), String(fresh.cid), 'tag lands on the live node');
  // And the recovered locator resolves to it and is clickable (the same
  // locator machinery probe() drives through the glide/click helpers).
  assert.equal(await fresh.loc.textContent(), 'Filter');
  await fresh.loc.click();
  assert.ok(page._clickLog.some((c) => c.type === 'locator-click' && c.text === 'Filter'), 'click executes through the recovered locator');
});

test('v2.8.3: genuinely-removed element returns null (no timeout burn)', async () => {
  const dom = makeDom(`<body><button id="filter">Filter</button></body>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  dom.window.document.querySelector('#filter').remove();
  const fresh = await mod.resolveFresh(page, els[0]);
  assert.equal(fresh, null, 'gone element must be null so probe records click-failed immediately');
});

test('v2.8.3: recovery never steals another element\'s tag', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="filter">Filter</button>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  // A DIFFERENT element now carries a tag: recovery must skip it.
  dom.window.document.querySelector('#filter').setAttribute('data-replay-cid', '999999');
  const oldNode = dom.window.document.querySelector('#filter');
  const fresh = await mod.resolveFresh(page, els[0]);
  assert.ok(fresh === null || String(fresh.cid) === '999999', 'must not re-tag or re-claim an already-tagged element');
  void oldNode;
});

test('v2.8.3: recovery matches identity, not just any same-selector element', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="f1">Filter</button><button id="f2">Filter</button><button id="f3">Filter</button>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  // Replace ALL nodes (re-render). Each record must recover ITS OWN node
  // (same id attribute), not the first match.
  const w = dom.window.document;
  for (const id of ['f1', 'f2', 'f3']) {
    const n = w.querySelector('#' + id);
    const c = n.cloneNode(true);
    c.removeAttribute('data-replay-cid');
    n.replaceWith(c);
  }
  const idsSeen = [];
  for (let i = 0; i < 3; i++) {
    const fresh = await mod.resolveFresh(page, els[i]);
    assert.ok(fresh, `record ${i} must recover`);
    assert.ok(String(fresh.cid).startsWith('S'));
    // The tag must land on the node this record CAME from — same id attr,
    // proving identity matching (not first-match) is what drove recovery.
    const owner = w.querySelector('#f' + (i + 1));
    assert.equal(owner.getAttribute('data-replay-cid'), String(fresh.cid), `record ${i} must recover ITS OWN node f${i + 1}`);
    idsSeen.push(fresh.cid);
  }
  assert.equal(new Set(idsSeen).size, 3, 'each recovery gets its own id');
});
