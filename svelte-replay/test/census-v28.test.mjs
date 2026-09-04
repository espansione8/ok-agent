// v2.8 census regressions: per-selector cap, cross-pass cid uniqueness,
// dropdown scoping, scope-aware dedup keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('v2.8: 80-cap is PER SELECTOR — buttons must not starve tbody tr / tabs', async () => {
  // 100 plain buttons (first selector) + a tbody tr + a [role=tab] later in
  // CLICKABLE. Under the old global cap the tr and tab got ZERO elements.
  let btns = '';
  for (let i = 0; i < 100; i++) btns += `<button>Btn ${i}</button>`;
  const dom = makeDom(`<!DOCTYPE html><html><body>
    ${btns}
    <table><tbody><tr id="row1"><td>Row cell</td></tr></tbody></table>
    <div role="tab" id="tab1">Details tab</div>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.ok(els.some((e) => e.sel === 'tbody tr'), 'tbody tr must be censused even with 100 buttons ahead (global cap starved it)');
  assert.ok(els.some((e) => e.sel === '[role="tab"]'), '[role=tab] must be censused even with 100 buttons ahead');
  const btnCount = els.filter((e) => e.sel === 'button').length;
  assert.ok(btnCount <= 80, `button selector still capped at 80, got ${btnCount}`);
});

test('v2.8: census ids stay unique across passes for FRESH nodes (no id reuse)', async () => {
  // Pass 1 tags Alpha. Between passes Alpha leaves the DOM and a new Beta
  // appears (Svelte re-render). Pass 2 must allocate a FRESH id for Beta —
  // the old per-pass counter restarted at 0 and collided with pass 1.
  const dom = makeDom(`<body><button id="a">Alpha</button></body>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const p1 = await mod.census(page);
  assert.equal(p1[0].cid, 1);
  dom.window.document.querySelector('#a').remove();
  dom.window.document.body.insertAdjacentHTML('beforeend', '<button id="b">Beta</button>');
  const p2 = await mod.census(page);
  assert.equal(p2[0].text, 'Beta');
  assert.ok(p2[0].cid > p1[0].cid, `fresh node must get a new id, not a reused per-pass one: p1=${p1[0].cid} p2=${p2[0].cid}`);
  const resolved = await page.locator(`[data-replay-cid="${p2[0].cid}"]`).textContent();
  assert.equal(resolved, 'Beta');
});

test('v2.8: census(page, DROPDOWN_SEL) scopes to the dropdown and returns [] when none open', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="bg">Background page button</button>
    <div class="dropdown-content" id="dd"><button id="item">Dropdown item</button></div>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page, '.dropdown-content, [role="menu"], [role="listbox"]');
  assert.ok(els.length > 0, 'dropdown children must be censused when a dropdown is open');
  assert.ok(els.every((e) => e.scope === 'dropdown'), 'records must carry scope=dropdown');
  assert.ok(!els.some((e) => e.text === 'Background page button'), 'page-level buttons must NOT leak into a dropdown-scoped census');
  // No dropdown open → empty result, caller skips probing.
  const dom2 = makeDom(`<body><button>Only page button</button></body>`);
  const page2 = makeMockPage(dom2);
  const els2 = await mod.census(page2, '.dropdown-content, [role="menu"], [role="listbox"]');
  assert.equal(els2.length, 0, 'no dropdown open → [] so sweepRoute skips probing');
});

test('v2.8: dedup key carries real scope — modal vs page scoping never collides', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button>Cancel</button>
    <dialog open><button>Cancel</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  // While the modal is open, census is modal-scoped (v2.5 rule): only modal
  // children visible. Close it and re-census: page scope. The two Cancel
  // buttons must differ in BOTH cid and dedup key.
  const modalEls = await mod.census(page);
  assert.ok(modalEls.every((e) => e.scope === 'modal') && modalEls.length >= 1, 'modal open → modal scope only');
  docCloseModal(dom);
  const pageEls = await mod.census(page);
  assert.ok(pageEls.every((e) => e.scope === 'page'), 'modal closed → page scope');
  const keys = [...modalEls, ...pageEls].map((e) => mod.dedupKey(page, e));
  assert.equal(new Set(keys).size, keys.length, 'all dedup keys unique across scopes and passes');
  const modalCancel = modalEls.find((e) => e.text === 'Cancel');
  const pageCancel = pageEls.find((e) => e.text === 'Cancel');
  assert.ok(modalCancel && pageCancel, 'both Cancellels present');
  assert.notEqual(modalCancel.cid, pageCancel.cid, 'distinct elements must carry distinct cids');
});

function docCloseModal(dom) {
  const d = dom.window.document.querySelector('dialog[open]');
  if (d) d.removeAttribute('open');
  const m = dom.window.document.querySelector('.modal-open');
  if (m) m.classList.remove('modal-open');
}

test('v2.8: census does NOT re-tag or strip in-flight elements', async () => {
  const dom = makeDom(`<body><button id="a">Alpha</button><button id="b">Beta</button></body>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const p1 = await mod.census(page);
  // Recursive census (modal/row branch) while the caller still holds
  // pass-1 locators: Alpha must keep ITS tag — re-tagging would invalidate
  // the in-flight batch the same way the old wipe did.
  const p2 = await mod.census(page);
  assert.equal(p2.find((e) => e.text === 'Alpha').cid, p1.find((e) => e.text === 'Alpha').cid, 'same element keeps its census id across passes');
  const resolved = await page.locator(`[data-replay-cid="${p1[0].cid}"]`).textContent();
  assert.equal(resolved, 'Alpha', 'pass-1 locator must still resolve after a later census');
});
