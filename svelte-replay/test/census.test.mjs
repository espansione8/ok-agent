// Census behavioral tests: modal scoping + cid-tagged locators, visibility
// cap ordering, disabled/javascript filtering, EXCLUDES fields, dedup keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('census is modal-scoped and locators resolve via data-replay-cid (v2.6 regression)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="b1">Save invoice</button>
    <dialog id="modal" open><button id="cancel">Cancel</button><button id="ok">OK</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const texts = els.map((e) => e.text);
  assert.ok(texts.includes('Cancel') && texts.includes('OK'), 'census sees only modal children, got: ' + texts.join(','));
  const cancel = els.find((e) => e.text === 'Cancel');
  const resolved = await page.locator(`[data-replay-cid="${cancel.cid}"]`).textContent();
  assert.equal(resolved, 'Cancel', 'locator via data-replay-cid must resolve INSIDE the modal (v2.5 clicked the page-level button behind it)');
  assert.ok(!els.some((e) => e.text.includes('Save')), 'no page-level button may leak into a modal-scoped census');
});

test('census cap applies AFTER visibility filtering (90 hidden + 5 visible)', async () => {
  let hidden = '';
  for (let i = 0; i < 90; i++) hidden += `<div style="display:none"><button>Hidden ${i}</button></div>`;
  const dom = makeDom(`<!DOCTYPE html><html><body>${hidden}<button>Visible A</button><button>Visible B</button><button>Visible C</button><button>Visible D</button><button>Visible E</button></body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const visible = els.filter((e) => e.text.startsWith('Visible'));
  assert.equal(visible.length, 5, 'all 5 visible elements censused even with 90 hidden ones ahead');
});

test('aria-disabled elements are excluded', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="good">Normal</button>
    <button id="bad" aria-disabled="true" data-testid="ghost">Ghost</button>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.ok(!els.some((e) => e.text === 'Ghost'), 'aria-disabled="true" must be filtered');
  assert.ok(els.some((e) => e.text === 'Normal'), 'normal elements still censused');
});

test('javascript: links are excluded', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <a id="js" href="javascript:alert(1)">Click me</a>
    <a id="ok" href="/invoices">Invoices</a>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.ok(!els.some((e) => e.href?.startsWith('javascript:')), 'javascript: hrefs must be filtered');
  assert.ok(els.some((e) => e.text === 'Invoices'), 'normal links still censused');
});

test('EXCLUDES matching fields exclude sel/tag — "--exclude button" cannot nuke every button', async () => {
  const dom = makeDom(`<body><button id="a">Save user</button><a id="b" href="/x">Link thing</a></body>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const d = els.find((e) => e.text === 'Save user');
  const fields = [d.text, d.tid, d.title, d.aria, d.href];
  assert.ok(fields.every((f) => !String(f ?? '').includes('button')), 'semantic fields must not contain the selector');
});

test('dedup keys are unique across identical sibling rows', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body><table><tbody>
    <tr><td>A</td><td><button class="edit">Edit</button></td></tr>
    <tr><td>B</td><td><button class="edit">Edit</button></td></tr>
    <tr><td>C</td><td><button class="edit">Edit</button></td></tr>
  </tbody></table></body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const keys = new Set(els.map((e) => mod.dedupKey(page, e)));
  assert.equal(els.length, 6);
  assert.equal(keys.size, 6, 'identical per-row controls must produce distinct dedup keys');
});

test('census records carry sel and i (dedupKey + coverage need them)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body><button>A</button><button>B</button></body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.ok(els.every((e) => typeof e.sel === 'string' && e.sel.length > 0), 'sel present');
  assert.ok(els.every((e) => typeof e.i === 'number'), 'i present');
  const [k1, k2] = els.map((e) => mod.dedupKey(page, e));
  assert.notEqual(k1, k2);
  assert.ok(!k1.includes('undefined'), 'no undefined fields in dedup keys');
});
