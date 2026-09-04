// v2.8 probe regressions: the close-modal ladder, the stuck-modal escape,
// exclusive <details name=group> detection, state-toggled accordion detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('v2.8: closeModal ladder handles Close/Dismiss/No/× — not just exact "Cancel"', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <dialog open><button id="close">Close</button><button id="ok">OK</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  page._setClickHook(() => dom.window.document.querySelector('dialog[open]')?.removeAttribute('open'));
  const outcome = await mod.closeModal(page);
  assert.equal(outcome, 'closed', 'a Close-worded button must dismiss the modal');
  const clicks = page._clickLog.filter((c) => c.type === 'element-click');
  assert.ok(clicks.some((c) => c.id === 'close'), 'Close-worded button must be tried (old code only matched exact "Cancel")');
  assert.ok(!clicks.some((c) => c.id === 'ok'), 'OK/confirm must NEVER be auto-clicked (may execute a destructive action)');
});

test('v2.8: closeModal never clicks OK — falls to Escape and opener rungs instead', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <dialog open><button id="ok">OK</button><button id="cancel2">Proceed</button></dialog>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  page._setClickHook(() => dom.window.document.querySelector('dialog[open]')?.removeAttribute('open'));
  const outcome = await mod.closeModal(page);
  assert.equal(outcome, 'closed');
  const ids = page._clickLog.filter((c) => c.type === 'element-click').map((c) => c.id);
  assert.ok(!ids.includes('ok'), 'OK must never be clicked by the closer');
});

test('v2.8: unclosable modal → stuck + reload escape recorded, never a trapped sweep', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button>Page button</button>
    <div class="modal modal-open" id="stuck"><button id="inner">Do thing</button><p>Nothing dismiss-worded here</p></div>
  </body></html>`, 'http://localhost:5173/invoices');
  const mod = await loadEmbedded();
  const page = makeMockPage(dom, { url: 'http://localhost:5173/invoices' });
  // The stuck-escape reloads the route; simulate it clearing the modal.
  page._setGotoHook(() => dom.window.document.querySelector('.modal-open')?.classList.remove('modal-open'));
  const els = await mod.census(page);
  const target = els[0];
  const report = [];
  const code = await mod.probe(page, { ...target, loc: page.locator(`[data-replay-cid="${target.cid}"]`) }, 0, report);
  assert.equal(code, 'navigated', 'probe must abort the batch after the stuck-escape reload');
  const rec = report[0];
  assert.ok(String(rec.result).includes('modal-stuck-reload'), 'record must name the stuck-modal escape, got: ' + rec.result);
});

test('v2.8: exclusive <details name=group> swap (equal open count) IS detected', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <details id="a" open><summary>Panel A</summary><button>Child A</button></details>
    <details id="b"><summary>Panel B</summary><button>Child B</button></details>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  // Exclusive group: clicking B's summary closes A and opens B.
  page._setClickHook(() => {
    const w = dom.window.document;
    w.querySelector('#a').removeAttribute('open');
    w.querySelector('#b').setAttribute('open', '');
  });
  const els = await mod.census(page);
  const summaryB = els.find((e) => e.text === 'Panel B');
  const report = [];
  await mod.probe(page, { ...summaryB, loc: page.locator(`[data-replay-cid="${summaryB.cid}"]`) }, 0, report);
  const rec = report.find((r) => r.text === 'Panel B');
  assert.equal(rec?.result, 'details-expanded', 'equal-count vector swap must be classified as details-expanded, got: ' + rec?.result);
});

test('v2.8: hand-built aria-expanded accordion IS detected and recursed', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <button id="tog" aria-expanded="false" aria-controls="panel">Toggle panel</button>
    <div id="panel" hidden><button id="inner">Panel action</button></div>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  page._setClickHook(() => {
    const w = dom.window.document;
    const tog = w.querySelector('#tog');
    const panel = w.querySelector('#panel');
    // Toggle BOTH ways — probe re-clicks the toggle to collapse, and that
    // click flows through the same hook.
    if (tog.getAttribute('aria-expanded') === 'false') {
      tog.setAttribute('aria-expanded', 'true');
      panel.removeAttribute('hidden');
    } else {
      tog.setAttribute('aria-expanded', 'false');
      panel.setAttribute('hidden', '');
    }
  });
  const els = await mod.census(page);
  const tog = els.find((e) => e.text === 'Toggle panel');
  const report = [];
  await mod.probe(page, { ...tog, loc: page.locator(`[data-replay-cid="${tog.cid}"]`) }, 0, report);
  const rec = report.find((r) => r.text === 'Toggle panel');
  assert.equal(rec?.result, 'details-expanded', 'aria-expanded flip must be classified as details-expanded, got: ' + rec?.result);
  assert.equal(dom.window.document.querySelector('#tog').getAttribute('aria-expanded'), 'false', 'toggle must be re-clicked to collapse');
});
