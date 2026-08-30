---
name: svelte-replay
description: >
  Generates a recorded, cursor-visible Playwright replay script (in the exact style of
  plan/replay-demo.mjs) for a SvelteKit app that exhaustively exercises EVERY route,
  button, link, tab, dropdown, modal, select, checkbox, expandable table row, and every
  nested child element revealed by expanding rows/menus/modals. Use when asked to
  "replay the app", "test every button / every clickable element", "full UI coverage
  sweep", "make a demo recording script", or to build/extend a replay-demo.mjs-style
  walkthrough.
---

# svelte-replay — full-app recorded replay + exhaustive UI sweep

Build ONE self-contained Node ESM script (default output: `plan/replay-all.mjs`, or
extend an existing `plan/replay-demo.mjs`) that:

1. Logs in, selects the target company (demo baseline if one exists).
2. Runs any scripted business-flow parts (the `PARTS` array pattern from replay-demo.mjs).
3. **SWEEP mode**: on every route, finds every clickable element, clicks it, observes
   the result, then RECURSES into whatever it revealed — expanded table-row panels,
   open `<details>` dropdowns, modals, newly-revealed child buttons/selects — and
   clicks those too.
4. Records everything with the in-page white-arrow cursor overlay (OBS-capturable).
5. Restores app state after each probe and rolls the DB back to baseline at the end.
6. Writes a coverage report (`plan/coverage.json` + `plan/coverage.md`).

## 1. Inputs to collect (ask if missing)

| Input                | Generated-script flag | Default / example                        |
|----------------------|-----------------------|------------------------------------------|
| Base URL             | `--base-url`          | `http://localhost:5173` (use a FREE port)|
| Login path + creds   | `--user` / `--pass`   | `/login`, demo user `1/1` if seeded      |
| Company to open      | `--company`           | first company card on `/companies`       |
| DB reset             | `--reset-url`         | in-app reset form (see replay-demo §resetViaForm); else skip |
| Output script path   | (agent writes it)     | `plan/replay-all.mjs`                    |
| Shot dir             | `--shot-dir`          | optional screenshots per part/route      |

Generated script CLI (all must exist):
`--fast` `--headless` `--mode sweep|scripted|both` (default `both`)
`--until N` `--from N` (part indices, replay-demo semantics)
`--max-clicks N` (sweep budget, default 2000) `--allow-destructive`
`--exclude "<text-or-testid>"` (repeatable) `--deep-selects` (cycle every `<option>`)
`--month YYYY-MM` `--shot-dir DIR`.

## 2. Copy VERBATIM from replay-demo.mjs (proven, battle-hardened)

When generating the script, reuse these blocks unchanged — each encodes a fix for a
real failure mode:

- `CURSOR_JS` overlay + `context.addInitScript(CURSOR_JS)` (lazy DOMContentLoaded attach).
- Pacing table `P` (`moveStep 14 / settle 280 / typeDelay 50 / post 550 / between 1300`,
  zeroed under `--fast`).
- Helpers: `center`, `glide`, `settleHydration`, `click`, `type`, `fill`, `pickSelect`,
  `pickSelectContains`, `pickFromDetails`, `pickTreeAccount`, `pickAsset`, `toast`,
  `openModalCancel`, `dlgInput`, `waitToastClear`, `navDropdownParent`, `nav` (3-retry),
  `documentsTab`, `resetViaForm`, `shot`.
- `main()` plumbing: viewport 1440×900, login retry ×3, `page.on('response')` POST/action-
  failure watcher, `page.on('console')` forwarding of `[debug-*]`, `PARTS` loop with
  `--from/--until`, reset-form rollback at the end AND on failure, `process.exitCode`
  (never `process.exit()` — truncates stdout on Windows pipes).

## 3. Coverage taxonomy — what the census MUST find, per route

```js
const CLICKABLE = [
  'button:not([disabled])',
  'a[href]:not([aria-disabled="true"])',
  '[role="button"]',
  'summary',                                 // <details> dropdown headers
  'input[type="checkbox"]:not([disabled])',
  'input[type="radio"]:not([disabled])',
  'select:not([disabled])',                  // enumerate options; cycle only with --deep-selects
  'tbody tr:has(button)',                    // expandable table rows
  'tbody tr[data-expandable]',
  '[data-testid]',                           // app-specific affordances
  '.dropdown > div[role="button"]',          // DaisyUI ⋯ menus
  'ul li button',                            // picker result rows
  '[role="tab"]',
];
```

Plus **nested/child elements discovered dynamically after each click** (this is the core
requirement): rows revealed in `following-sibling::tr` panels (their buttons, selects,
dates), controls inside `dialog.modal-open` (recurse, then close via Cancel/Escape),
items inside an opened `details.dropdown`, pagination/load-more, keyboard navigation on
active grids (ArrowUp/ArrowDown — verify the outline/active class moves).

## 4. The sweep walker (core algorithm to embed)

```js
const DESTRUCTIVE = /void|delete|remove|drop|purge|reset|disable|log ?out|sign ?out|изтри|изтрив|анулир/i;
const visited = new Set();        // key: route|sel|text|tid — never re-click the same element
const routeQueue = new Set();     // URLs discovered during probes; crawled later

const describe = async (loc) => {
  const tag   = await loc.evaluate((n) => n.tagName.toLowerCase()).catch(() => '?');
  const text  = (await loc.innerText().catch(() => ''))?.trim().replace(/\s+/g, ' ').slice(0, 60);
  const tid   = await loc.getAttribute('data-testid').catch(() => null);
  const title = await loc.getAttribute('title').catch(() => null);
  const href  = await loc.getAttribute('href').catch(() => null);
  return { tag, text, tid, title, href };
};

async function census(page) {
  const out = [];
  for (const sel of CLICKABLE) {
    const locs = page.locator(sel);
    const n = await locs.count();
    for (let i = 0; i < n; i++) {
      const loc = locs.nth(i);
      if (!(await loc.isVisible().catch(() => false))) continue;   // hidden tab panels etc.
      const d = await describe(loc);
      if (!d.text && !d.tid && !d.title && !d.href) continue;      // anonymous noise
      if (EXCLUDES.some((x) => JSON.stringify(d).includes(x))) continue;
      if (d.href && /^(https?:|mailto:)/.test(d.href)) continue;   // external links
      out.push({ sel, loc, d });
    }
  }
  return out;
}

const fingerprint = (page) => page.evaluate(() => ({
  url: location.pathname + location.search,
  dlg: document.querySelectorAll('dialog.modal-open').length,
  rows: document.querySelectorAll('tbody tr').length,
  open: document.querySelectorAll('details[open]').length,
}));

async function probe(page, el, depth, report, counters) {
  if (counters.clicks >= MAX_CLICKS || depth > 6) return;
  const key = page.url() + '|' + el.sel + '|' + el.d.text + '|' + (el.d.tid ?? '');
  if (visited.has(key)) return;
  visited.add(key);
  const rec = { route: page.url(), sel: el.sel, ...el.d, depth, result: 'clicked' };
  const label = el.d.text || el.d.tid || el.sel;

  if (DESTRUCTIVE.test(`${el.d.text} ${el.d.title ?? ''}`) && !ALLOW_DESTRUCTIVE) {
    rec.result = 'skipped-destructive'; report.push(rec); return;
  }
  const fp = await fingerprint(page);
  counters.clicks++;

  // <select>: never mouse-click (native popup reverts — see replay-demo). Enumerate,
  // optionally cycle, restore the original value.
  if (el.d.tag === 'select') {
    rec.options = await el.loc.locator('option').count();
    const before = await el.loc.inputValue().catch(() => null);
    if (DEEP_SELECTS) for (let i = 1; i < rec.options; i++) {
      await el.loc.selectOption(i); await sleep(P.post);
    }
    if (before !== null) await el.loc.selectOption(before).catch(() => {});
    rec.result = `select-enumerated (${rec.options} options)`;
    report.push(rec); return;
  }

  try { await click(page, el.loc, `sweep: ${label}`); }
  catch (e) { rec.result = 'click-failed: ' + String(e?.message ?? e).slice(0, 160); report.push(rec); return; }

  // Classify the outcome and RECURSE into whatever the click revealed.
  if (await page.locator('dialog.modal-open').count()) {
    rec.result = 'modal-opened';
    for (const child of await census(page)) await probe(page, child, depth + 1, report, counters);
    await page.locator('dialog.modal-open').getByRole('button', { name: 'Cancel', exact: true })
      .first().click().catch(() => page.keyboard.press('Escape'));
  } else if (el.sel.includes('tbody tr')) {
    const panel = el.loc.locator('xpath=following-sibling::tr[1]');
    if (await panel.isVisible().catch(() => false)) {
      rec.result = 'row-expanded';
      for (const child of await census(page)) await probe(page, child, depth + 1, report, counters);
      await el.loc.locator('button').first().click().catch(() => {}); // collapse back
    }
  } else {
    const fp2 = await fingerprint(page);
    if (fp2.url !== fp.url) {
      rec.result = 'navigated → ' + fp2.url;
      if (!fp2.url.startsWith('/login')) routeQueue.add(fp2.url);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await settleHydration(page);
    } else if (fp2.open > fp.open) {
      rec.result = 'dropdown-opened';
      await page.keyboard.press('Escape').catch(() => {});
    } else if (fp2.rows > fp.rows) {
      rec.result = 'rows-revealed';
      for (const child of await census(page)) await probe(page, child, depth + 1, report, counters);
    }
  }

  // Restore state; verify with the fingerprint (2 retries).
  for (let t = 0; t < 2; t++) {
    const now = await fingerprint(page);
    if (now.url === fp.url && now.dlg === fp.dlg) break;
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('dialog.modal-open').getByRole('button', { name: 'Cancel', exact: true })
      .first().click().catch(() => {});
  }
  report.push(rec);
}

async function sweepRoute(page, url, report, counters) {
  await page.goto(BASE_URL + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await settleHydration(page);
  // DaisyUI navbar dropdowns render links only on hover — open each parent first.
  for (const parent of ['Documents', 'Accounting', 'Reports', 'Admin']) {
    await page.locator('header').getByText(parent, { exact: true }).first().hover().catch(() => {});
    await sleep(300);
  }
  let elements = await census(page);
  let guard = 0;
  while (elements.length && guard++ < 8) {       // re-census: expansion reveals new nodes
    const before = elements.length;
    for (const el of elements) await probe(page, el, 0, report, counters);
    elements = (await census(page)).filter((el) =>
      !visited.has(page.url() + '|' + el.sel + '|' + el.d.text + '|' + (el.d.tid ?? '')));
    if (elements.length >= before) break;          // no new elements → route fully swept
  }
  await shot(page, 'sweep-' + url.replace(/[^a-z0-9]+/gi, '_'));
}
```

Route crawl: seed `routeQueue` from the `navMap` in `nav()` (all known routes) +
`/companies` cards + user-supplied URLs; drain it after the scripted parts, appending
URLs discovered by probes; cap 60 routes; skip 403/forbidden pages with a
`skipped-forbidden` record.

## 5. Hard-won robustness rules (from the reference script — do NOT skip)

1. **Hydration race (T-53).** SSR markup is visible before Svelte attaches handlers.
   After EVERY navigation run `settleHydration()` before clicking; on click failure
   retry once after another settle.
2. **Toast overlays swallow navbar clicks.** `waitToastClear()` before nav clicks;
   after a save verify the exact success toast (`toast()` logs ✓/⚠, never hard-fails).
3. **Native `<select>`**: focus + `selectOption()`, never a mouse click (popup reverts
   the pick); verify `option:checked` afterwards.
4. **Expand vs toggle.** Check `details.open` / panel visibility before clicking a
   `summary`/row toggle, so you never collapse what a previous step opened.
5. **Destructive guard.** Skip-and-report anything matching the `DESTRUCTIVE` regex
   unless `--allow-destructive`. Posted documents get VOIDED with a reason, never
   hard-deleted.
6. **Downloads/popups** (`*.TXT`, PDFs, UBL): wrap in `page.waitForEvent('download'|'popup')`,
   close popup pages, log `suggestedFilename()`.
7. **POST watcher + console forwarding** exactly as in replay-demo's `main()`.
8. **Exit**: print stack BEFORE `browser.close()`, use `process.exitCode = 1`,
   never `process.exit()`.

## 6. Coverage report (always written, even on failure)

`plan/coverage.json`:

```json
{ "routes": 24, "elements": 512, "clicked": 480, "skipped-destructive": 18,
  "failed": 6, "modals": 31, "row-expansions": 44, "selects": 39,
  "records": [ { "route": "...", "sel": "...", "text": "...", "tid": "...", "result": "...", "depth": 0 } ] }
```

`plan/coverage.md`: per-route table + a FAILED / SKIPPED section. Every failed record
must name route + selector + text so the fix is one locator edit.

## 7. Runbook

1. Prereqs: dev server on a free port, DB at baseline, login works.
2. Smoke: `--fast --headless --mode sweep` → fix every reported locator, re-run.
3. Recording: default pace, window visible (or OBS), optional `--shot-dir plan/_shots`.
4. Rollback: drive the in-app reset form (`resetViaForm` pattern); fall back to the
   project's restore script; if neither exists, tell the user to restore manually.
5. Deliver: `plan/coverage.md` summary — X routes, Y elements, Z clicked, every
   failure listed with its selector.

## 8. Failure handling

- Stop the sweep on the FIRST unrecoverable locator error, naming route/selector;
  attempt DB rollback; print the stack before closing the browser; `exitCode = 1`.
- Never hard-delete posted documents (void with reason instead).
- Admin-gated route (401/403) → record `skipped-forbidden`, continue.
- If the sweep budget (`--max-clicks`) is hit, write the partial report and exit 0
  with a note — partial coverage is still a deliverable.