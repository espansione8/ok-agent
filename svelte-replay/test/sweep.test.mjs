// probe()/sweepRoute() behavioral tests: lazy-load loop continuation,
// navigation recovery, row-collapse targeting, details/accordion recursion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

test('sweepRoute keeps sweeping while unvisited elements remain (+1-per-click lazy load)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body><button>Seed</button></body></html>`, 'http://localhost:5173/list');
  const doc = dom.window.document;
  const mod = await loadEmbedded();
  const page = makeMockPage(dom, {
    url: 'http://localhost:5173/list',
    onClick: async () => {
      const b = doc.createElement('button');
      b.textContent = 'Lazy ' + doc.querySelectorAll('button').length;
      doc.body.appendChild(b);
    },
  });
  const report = [];
  await mod.sweepRoute(page, '/list', report);
  const lazy = report.filter((r) => r.text?.startsWith('Lazy'));
  // v2.5 stopped when newCount === beforeCount — a +1-per-click loader hit
  // equality on round 1 and everything after was skipped.
  assert.ok(lazy.length >= 3, `sweep must continue while unvisited elements remain (got ${lazy.length} lazy probes)`);
});

test('goBack failure falls back to hard goto — sweep never strands on the wrong page', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body><a href="/other">Go</a></body></html>`, 'http://localhost:5173/list');
  const mod = await loadEmbedded();
  const page = makeMockPage(dom, {
    url: 'http://localhost:5173/list',
    onClick: async () => page._pushUrl('http://localhost:5173/other'),
    onGoBack: async () => { /* no-op: simulates a failed/no-effect goBack */ },
  });
  const report = [];
  await mod.probe(page, (await mod.census(page))[0], 0, report);
  assert.ok(page.url().endsWith('/list'), `sweep must return to the original route (url=${page.url()})`);
});

test('row collapse re-clicks the ROW, never an inner Edit/Delete button', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body><table><tbody>
    <tr id="row1"><td>Edit</td><td>Delete</td></tr>
  </tbody></table></body></html>`, 'http://localhost:5173/rows');
  const doc = dom.window.document;
  let expanded = false;
  const mod = await loadEmbedded();
  const page = makeMockPage(dom, {
    url: 'http://localhost:5173/rows',
    onClick: async () => {
      if (!expanded) {
        expanded = true;
        const p = doc.createElement('tr');
        p.className = 'panel';
        p.textContent = 'detail panel';
        doc.querySelector('#row1').after(p);
      }
    },
  });
  const report = [];
  await mod.probe(page, (await mod.census(page)).find((e) => e.sel === 'tbody tr'), 0, report);
  assert.ok(report.some((r) => r.result === 'row-expanded'), 'row click yields row-expanded');
  assert.ok(page._clickLog.filter((c) => c.type === 'mouse-click').length >= 2, 'row clicked to expand AND to collapse — no inner control touched');
});

test('details expansion recurses into revealed children (census sees them once open)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <details id="acc"><summary>Show actions</summary>
      <button id="inner1">Inner action A</button>
      <button id="inner2">Inner action B</button>
    </details>
  </body></html>`);
  const doc = dom.window.document;
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  assert.ok(els.some((e) => e.tag === 'summary'), 'summary censused while closed');
  doc.getElementById('acc').setAttribute('open', '');
  const els2 = await mod.census(page);
  assert.ok(els2.some((e) => e.text === 'Inner action A'), 'v2.5 pressed Escape and skipped revealed children; probe() must recurse');
  doc.getElementById('acc').removeAttribute('open');
});
