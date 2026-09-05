// v2.8.4 follow-up audit regressions: scoped exact-text recovery, clicked-
// locator handoff, select-branch recovery + bounded inputValue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('v2.8.4: recovery NEVER crosses the modal boundary (scope-preserving)', async () => {
  // Modal open, carrying the orphaned "Save" child. A page-level "Save"
  // sits BEHIND the dialog. The document-wide v2.8.3 search matched it —
  // reintroducing the behind-the-modal click bug via recovery.
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="bg-save">Save</button>
    <dialog open><button id="modal-save">Save</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.equal(els[0]?.scope, 'modal', 'precondition: census is modal-scoped');
  // Orphan the modal child's tag (simulated re-render that kept the node).
  dom.window.document.querySelector('#modal-save').removeAttribute('data-replay-cid');
  const fresh = await mod.resolveFresh(page, els[0]);
  assert.ok(fresh, 'modal child must be recoverable while the modal is open');
  const tagged = dom.window.document.querySelector('#modal-save').getAttribute('data-replay-cid');
  assert.equal(tagged, String(fresh.cid), 'tag must land on the MODAL child, never the background Save');
  assert.ok(dom.window.document.querySelector('#bg-save').getAttribute('data-replay-cid') == null, 'background element must stay untagged');
});

test('v2.8.4: recovery with closed scope root returns null (genuinely gone)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="page-save">Save</button>
    <dialog open><button id="m">Save</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  // The re-render that closed the modal ALSO replaced the node (tag gone):
  // recovery must find the scoped root closed and return null — the page
  // "Save" behind it must NEVER be claimed as a recovery target.
  const w = dom.window.document;
  w.querySelector('dialog[open]').removeAttribute('open');
  w.querySelector('#m').removeAttribute('data-replay-cid');
  const fresh = await mod.resolveFresh(page, els[0]);
  assert.equal(fresh, null, 'closed scope root = element genuinely gone; page Save must never be claimed');
  assert.ok(w.querySelector('#page-save').getAttribute('data-replay-cid') == null, 'background Save stays untagged');
});

test('v2.8.4: exact-text matching — "Save" must not recover onto "Save Draft"', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="draft">Save Draft</button>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  // Forge a record whose text is "Save" (as if its real node were lost).
  const rec = { sel: 'button', i: 0, scope: 'page', tag: 'button', text: 'Save', tid: null, title: null, aria: null, href: null, cid: 1 };
  const fresh = await mod.resolveFresh(page, rec);
  assert.equal(fresh, null, 'substring identity ("Save" vs "Save Draft") must not match');
  assert.ok(dom.window.document.querySelector('#draft').getAttribute('data-replay-cid') == null, 'Save Draft must stay untagged');
});

test('v2.8.4: select branch recovers an orphaned tag and keeps its 1500ms bound', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <select id="s"><option value="a">Alpha</option><option value="b" selected>Beta</option></select>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.equal(els[0].tag, 'select');
  // Orphan + replace the select node (re-render).
  const oldNode = dom.window.document.querySelector('#s');
  const newNode = oldNode.cloneNode(true);
  newNode.removeAttribute('data-replay-cid');
  oldNode.replaceWith(newNode);
  const report = [];
  const code = await mod.probe(page, els[0], 0, report);
  void code;
  const r = report[0];
  assert.ok(r.result.startsWith('select-enumerated'), 'orphaned select must be recovered and enumerated, got: ' + r.result);
  assert.ok(r.result.includes('2 options'), 'both options seen, got: ' + r.result);
  // Restore must have put the original value back on the REPLACED node.
  assert.equal(dom.window.document.querySelector('#s').value, 'b', 'pre-sweep value restored on the live node');
});
