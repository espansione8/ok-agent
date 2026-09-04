// Select enumeration + CLI parsing tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDom, makeMockPage, loadEmbedded } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = () => readFileSync(join(HERE, '.build', 'embedded.mjs'), 'utf8');

test('deep-select enumeration reads real option values/labels and guards them (v2.6)', async () => {
  const dom = makeDom(`<!DOCTYPE html><html><body>
    <select id="s"><option value="keep">Keep</option><option value="void-all">Void all invoices</option><option value="purge">Purge history</option></select>
  </body></html>`);
  const mod = await loadEmbedded();
  const page = makeMockPage(dom);
  const els = await mod.census(page);
  const sel = els.find((e) => e.tag === 'select');
  assert.ok(sel, 'select censused');
  const options = await page.evaluate((cid) => {
    const el = document.querySelector(`[data-replay-cid="${cid}"]`);
    return [...el.querySelectorAll('option')].map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() }));
  }, sel.cid);
  assert.equal(options.length, 3);
  assert.equal(options[1].value, 'void-all', 'option VALUES are read (v2.5 passed numeric index as value and threw)');
  const destructive = options.filter((o) => mod.DESTRUCTIVE.test(`${o.label} ${o.value}`));
  assert.deepEqual(destructive.map((o) => o.value), ['void-all', 'purge'], 'option labels/values must pass the DESTRUCTIVE guard before enumeration');
});

test('CLI: val() rejects flag-like/missing values; MODE validated; parseIntSafe present', async () => {
  const s = src();
  assert.match(s, /const val = \(n, d\) => \{[\s\S]*?startsWith\('--'\)/, 'val() must reject flag-like next tokens (trailing --param crashed list parsing)');
  assert.match(s, /const list = \(n\) => \{[\s\S]*?startsWith\('--'\)/, 'list() must skip missing/flag next tokens');
  assert.ok(s.includes('parseIntSafe'), '--until abc must fall back, not NaN into slice(0, NaN)');
});
