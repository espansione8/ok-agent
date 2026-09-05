// v2.9.1 ELEMENT-ANCHORED DISPATCH regressions — the census→locator contract.
// The promise: the cosmetic glide can take as long as it likes; a re-render
// that parks a DIFFERENT element under the glided coordinates can never
// receive the input event, because dispatch resolves the true node at the
// last possible moment and clicks THAT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('v2.9.1: dispatch is element-anchored — the event targets the true node, not the coordinates', async () => {
  const dom = makeDom(`<body><button id="true-target">Save</button></body>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  await mod.click(page, els[0].loc, 'test');
  const kinds = page._clickLog.map((c) => c.type);
  assert.ok(kinds.includes('handle-click') || kinds.includes('locator-click'),
    'dispatch must go through the element (handle/locator click), got: ' + kinds.join(','));
  assert.ok(!kinds.includes('mouse-click'), 'the raw coordinate mouse.click must no longer be the dispatch path');
});

test('v2.9.1: impostor parked at the glided coordinates never receives the click', async () => {
  const dom = makeDom(`<body><button id="real">Save</button></body>`);
  const doc = dom.window.document;
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  // Simulate the TOCTOU race: DURING the glide (any hook into the click path)
  // the DOM re-renders — the true node is REPLACED by a new element with the
  // same tag/text, and a dangerous impostor takes over the old geometry.
  // With coordinate dispatch the impostor at (c.x, c.y) would be clicked.
  // With element-anchored dispatch the freshly-resolved node gets the event.
  const victim = doc.querySelector('#real');
  const replacement = doc.createElement('button');
  replacement.id = 'real-new';
  replacement.textContent = 'Save';
  const impostor = doc.createElement('button');
  impostor.id = 'impostor';
  impostor.textContent = 'Danger — Delete everything';
  victim.replaceWith(replacement);
  doc.body.appendChild(impostor);
  const report = [];
  await mod.probe(page, els[0], 0, report);
  const targets = page._clickLog.filter((c) => c.type === 'handle-click' || c.type === 'locator-click').map((c) => c.id || c.text);
  assert.ok(!targets.some((t) => String(t).includes('impostor')),
    'the impostor must never be the dispatch target, got: ' + JSON.stringify(targets));
});

test('v2.9.1: detached-node dispatch throws like a real ElementHandle and probe recovers via resolveFresh', async () => {
  const dom = makeDom(`<body><button id="b">Save</button></body>`);
  const doc = dom.window.document;
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  // The node the handle captured is replaced after resolution — handle.click
  // must throw (real ElementHandle semantics), and probe's resolveFresh retry
  // must then recover the semantic identity and land the click.
  const original = doc.querySelector('#b');
  await mod.probe(page, els[0], 0, []);
  const replacement = doc.createElement('button');
  replacement.id = 'b2';
  replacement.textContent = 'Save';
  original.replaceWith(replacement);
  // A fresh probe of the same semantic element recovers via resolveFresh
  // (new node, no tag): this is the recovery path that used to burn timeouts.
  const els2 = await mod.census(page);
  const report = [];
  await mod.probe(page, els2[0], 0, report);
  assert.ok(report.length === 0 || report[0].result === 'clicked', 'recovered element clicks cleanly, got: ' + JSON.stringify(report.map((r) => r.result)));
});

test('v2.9.3: mid-dispatch detach → handle.click throws → locator.click fallback throws (gone) → probe retry → resolveFresh recovers and lands the click', async () => {
  // The corrected §4.2 comment chain, driven end-to-end through ONE probe():
  // the tag is live at resolveFresh time; the DOM re-renders in the "final
  // ms" (the _dispatchGate seam fires at handle.click() time, BEFORE the
  // isConnected check, replacing the tagged node with an untagged twin —
  // exactly the Svelte re-render that detaches the true node mid-glide);
  // handle.click() throws for real; click()'s catch falls back to
  // locator.click(), which re-resolves the dead tag selector to ZERO matches
  // and throws (mock now faithful to Playwright's actionability timeout);
  // THAT throw is probe()'s retry signal; the retry runs resolveFresh, which
  // re-finds the twin by semantic identity and re-tags it 'S'-prefixed.
  const dom = makeDom(`<body><button id="b">Save</button></body>`);
  const doc = dom.window.document;
  const mod = await loadEmbedded();
  let detached = false;
  const page = makeMockPage(dom);
  page._setDispatchGate(() => {
    if (detached) return;                 // fire once: the first dispatch attempt
    detached = true;
    const original = doc.querySelector('#b');
    const twin = doc.createElement('button');
    twin.id = 'b2';
    twin.textContent = 'Save';
    original.replaceWith(twin);           // tag leaves the DOM with the original
  });
  const els = await mod.census(page);
  const report = [];
  await mod.probe(page, els[0], 0, report);
  assert.equal(report[0]?.result, 'clicked', 'the retry must recover and click, got: ' + JSON.stringify(report.map((r) => r.result)));
  // Exactly ONE successful dispatch — the retry. The first attempt's
  // handle.click threw (no log push) and the locator.click fallback threw on
  // the zero-match dead tag (no log push). A silent no-op at either step
  // would have recorded the element as clicked without the event landing.
  const successful = page._clickLog.filter((c) => c.type === 'handle-click' || c.type === 'locator-click');
  assert.equal(successful.length, 1, 'exactly one element dispatch expected, got: ' + JSON.stringify(page._clickLog));
  assert.ok(String(successful[0].id ?? successful[0].text).includes('Save') || successful[0].id === 'b2',
    'the successful dispatch must target the recovered twin: ' + JSON.stringify(successful[0]));
  // resolveFresh re-tagged the twin — an 'S'-prefixed id, never a census
  // numeric id, so it cannot collide with the next census pass.
  const tag = doc.querySelector('#b2').getAttribute('data-replay-cid');
  assert.match(tag ?? '', /^S/, 'recovered element must carry the resolveFresh S-prefixed tag, got: ' + tag);
  assert.ok(!page._clickLog.some((c) => c.type === 'mouse-click'), 'dispatch must never fall back to raw coordinate mouse.click');
});
