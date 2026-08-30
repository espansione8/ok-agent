---
name: svelte-replay
description: >
  Generates a recorded, cursor-visible Playwright replay script for ANY SvelteKit app
  with ZERO prior files or references. It first scans the entire codebase (routes,
  layout guards, server actions, endpoints, navbar structure, DB file location, login
  form) to build a route + element manifest from scratch, then emits one self-contained
  Node ESM script that exhaustively exercises EVERY route, button, link, tab, dropdown,
  modal, select, checkbox, expandable table row, form action, and every nested child
  element revealed by expanding rows/menus/modals. Use when asked to "replay the app",
  "test every button / every clickable element", "full UI coverage sweep", "make a demo
  recording script", or "build a walkthrough from scratch". The generated script
  snapshots the database before it touches anything and restores that exact snapshot
  afterward, so form-submitting probes discovered during the sweep can always be undone.
  Every file it touches — script, DB backups, screenshots, coverage reports, scratch —
  lives under one gitignorable folder: plan/replay/.
---

svelte-replay — full-app recorded replay + exhaustive UI sweep (self-contained, codebase-scanned)

===============================================================================
0. ZERO-DEPENDENCY PRINCIPLE (read first)
===============================================================================
This skill must work even if the target repo contains NO replay script, NO demo
script, and NO test plan. Do NOT read, import, or require any existing *.mjs
replay/test file. Everything you need is specified INLINE in this document:
copy the code blocks in §5 verbatim into the generated script.

The only inputs are the app's OWN source tree (read-only scan) and CLI flags.

All output lives under plan/replay/:
  plan/replay/replay-all.mjs          the generated script
  plan/replay/db-backups/             timestamped SQLite snapshots
  plan/replay/shots/                  optional screenshots
  plan/replay/coverage.json|.md       the coverage report
The user adds ONE .gitignore line (plan/replay/) to exclude all of it.

===============================================================================
1. PHASE A — CODEBASE SCAN (build the manifest from scratch)
===============================================================================
Before emitting anything, statically scan the repo to build a manifest. Use
fast file-globs + regex; never execute app code during the scan.

A1. ROUTES. Glob `src/routes/**/+page.svelte`. Convert each path:
    - strip `/src/routes` prefix and `/+page.svelte` suffix
    - `[param]` → `:param` (required), `[...param]` → `*param` (rest)
    Record: { path, params:[...], hasPage:true }.

A2. ACTIONS. For each route dir, if `+page.server.ts` exports `actions`,
    parse the exported action names (default + named). These are the forms that
    mutate server state; the sweep must probe them (with rollback) and report
    which fired. Record: { route, actions:[names] }.

A3. ENDPOINTS. Glob `src/routes/**/+server.ts` (REST) and `src/routes/api/**`.
    Record GET endpoints that look like downloads (return a file / set
    content-disposition) so the sweep can fetch+assert them without navigating.

A4. AUTH / LAYOUT GUARDS. Read `src/routes/+layout.server.ts` /
    `+layout.svelte` for redirects to `/login`. Confirm the login route exists;
    record the login field selectors by scanning the login page markup for
    `<input name=...|id=...|type=email|type=password>` and the submit button text.

A5. NAVBAR. Locate the header/nav component (search `src/lib` + layouts for
    `<header` or a Nav*.svelte). Extract top-level group labels and their child
    links. This drives hover-open of dropdown parents before crawling and seeds
    the route queue. Record: { parentLabel, links:[{label, href}] }.

A6. DB PATH. Grep for the on-disk SQLite file: patterns `dev.db`, `*.sqlite`,
    `DB_PATH`, `better-sqlite3`, `drizzle`, `new Database(`. Record the best
    guess (e.g. `data/dev.db`). This is the snapshot target (§4). Also record
    any reset/reseed endpoint or script (`reset`, `restore-baseline`, `seed`).

A7. SELECT OPTION SOURCES & PICKERS. Scan page markup for `data-testid`,
    DaisyUI `details.dropdown`, `dialog`, and `<select>` density per route — this
    informs the live census and lets the report name the right controls.

MANIFEST OUTPUT (in-memory, then written to plan/replay/manifest.json):
  { baseUrlGuess, login:{route,userSel,passSel,submitSel}, routes:[...],
    actions:[...], endpoints:[...], nav:{...}, dbPath, resetHint }

The static manifest SEEDS the run; the script ALSO does a live census at runtime
(§6) because SSR/hydration can hide or reveal elements the scan can't predict.

===============================================================================
2. PHASE B — EMIT THE REPLAY SCRIPT
===============================================================================
Write ONE self-contained Node ESM file: plan/replay/replay-all.mjs.
Import only `playwright`, `node:fs`, `node:path`. No relative imports from the
app. Embed, in order:

  1. CLI parsing (§3) + manifest embedded as a const (from Phase A).
  2. backupDatabase() / restoreDatabaseBackup() (§4).
  3. The verbatim embedded blocks (§5): cursor overlay, pacing, interaction
     helpers, nav helpers, reset fallback.
  4. Coverage taxonomy + census() (§6).
  5. The sweep walker: describe/fingerprint/probe/sweepRoute (§7).
  6. Param resolution for dynamic routes (§8).
  7. Optional scripted business-flow PARTS array (empty by default; the user can
     fill it in — the sweep alone already covers every clickable element).
  8. main() plumbing (§5.6).

Generated script CLI flags (all MUST exist):
  --base-url URL          default http://localhost:5173 (use a FREE port)
  --user U --pass P       default 1/1 if seeded; else required
  --company NAME|first    company to open (default: first card on /companies)
  --db-path PATH          SQLite file (also reads DB_PATH env); from manifest
  --backup-dir DIR        default plan/replay/db-backups
  --skip-backup           opt out of snapshot (CI only; not the default)
  --reset-url PATH        in-app reset route; else skip
  --mode sweep|scripted|both   default both
  --from N --until N      scripted-part indices
  --max-clicks N          sweep budget, default 2000
  --allow-destructive     permit words matched by the DESTRUCTIVE regex
  --exclude TEXT          repeatable; skip elements whose text/testid/title match
  --deep-selects          cycle every <option> (otherwise enumerate only)
  --month YYYY-MM         demo period, default current month
  --shot-dir DIR          optional; default plan/replay/shots when used
  --param name=value      repeatable; override dynamic-route param resolution

===============================================================================
3. DATABASE BACKUP — snapshot before anything else
===============================================================================
Sweep mode WILL click ordinary-looking forms (create dialogs, inline edits,
settings toggles) that the DESTRUCTIVE regex is too narrow to catch. A raw
file-level snapshot is the app-independent safety net; the in-app reset endpoint
is only a fallback (it depends on the app still working).

backupDatabase():
  - Run as the VERY FIRST line of main(), before chromium.launch(), so the file
    reflects the true pre-run state.
  - Copy the SQLite file at --db-path (or DB_PATH) plus any -wal/-shm sidecars
    into --backup-dir under a timestamped name (YYYYMMDD-HHMMSS).
  - If --db-path missing/file absent: log a warning, skip; rollback then relies
    solely on resetViaForm().

restoreDatabaseBackup():
  - Returns false when nothing was snapshotted (caller then falls back to
    resetViaForm()).
  - Copy the snapshot back over the live file(s) exactly — no app involvement.

Restore order, BOTH at end-of-run (success) AND in the catch block (failure):
  1. restoreDatabaseBackup()            (exact, fast, app-independent)
  2. resetViaForm() only if no snapshot exists
  3. if both fail, print the backup dir so the user can restore manually.

Log, never swallow: if the dev server holds an open SQLite connection through the
run, restoring the file underneath it can leave a stale WAL until the server
reconnects — tell the user a dev-server restart may be needed after restore.

Embed these as two small functions next to resetViaForm (§5.5).

===============================================================================
4. EMBEDDED CODE BLOCKS (copy verbatim into the emitted script)
===============================================================================

--- 4.1 CURSOR_JS: in-page white-arrow overlay (OBS-capturable) ---------------
const CURSOR_JS = `
(() => {
  if (window.__replayCursorEl) return;
  const build = () => {
    if (window.__replayCursorEl) return window.__replayCursorEl;
    const el = document.createElement('div');
    el.id = 'replay-cursor';
    el.style.cssText =
      'position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;' +
      'z-index:2147483647;transform:translate(-1px,-1px);' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.65));';
    el.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" stroke="#111111" stroke-width="1.4" stroke-linejoin="round">' +
      '<path d="M4 2 L4 17.5 L8 13.8 L10.9 20.5 L14.1 19.2 L11.2 12.6 L16.4 12.6 Z"/></svg>';
    (document.body ?? document.documentElement)?.appendChild(el);
    window.__replayCursorEl = el;
    return el;
  };
  let el = null, raf = null;
  const ensure = () => { el = el && el.isConnected ? el : build(); return el; };
  if (document.readyState !== 'loading') ensure();
  else document.addEventListener('DOMContentLoaded', () => ensure(), { once: true });
  window.addEventListener('mousemove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; const cur = ensure();
      cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; });
  }, true);
})();
`;
// register: await context.addInitScript(CURSOR_JS);

--- 4.2 Pacing + sleep/log ----------------------------------------------------
const P = FAST
  ? { moveStep: 0, settle: 0, typeDelay: 1, post: 0, between: 0 }
  : { moveStep: 14, settle: 280, typeDelay: 50, post: 550, between: 1300 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (part, msg) => console.log(`\n▶ ${part} — ${msg}`);

--- 4.3 Interaction helpers (EVERY action glides the cursor first) ------------
const center = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box (hidden?)');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const glide = async (page, x, y) => {
  if (FAST) { await page.mouse.move(x, y); return; }
  const cur = await page.evaluate(() => ({ x: window.__curX ?? innerWidth/2, y: window.__curY ?? innerHeight/2 }));
  const dist = Math.hypot(x-cur.x, y-cur.y);
  const steps = Math.max(1, Math.min(80, Math.ceil(dist/26)));
  for (let i=1;i<=steps;i++){
    await page.mouse.move(cur.x+((x-cur.x)*i)/steps, cur.y+((y-cur.y)*i)/steps);
    await sleep(P.moveStep);
  }
  await page.evaluate(([cx,cy])=>{window.__curX=cx;window.__curY=cy;},[x,y]);
};
// T-53: SSR HTML is interactive-looking before Svelte hydrates — settle first.
const settleHydration = async (page) => {
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}
  await page.waitForTimeout(250);
};
const click = async (page, locator, label) => {
  if (FAST) { await settleHydration(page);
    try { await locator.scrollIntoViewIfNeeded(); await locator.click({ timeout: 8000 }); return; } catch {} }
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y); await sleep(P.post);
};
const type = async (page, locator, text, label) => {
  if (FAST) { await settleHydration(page);
    try { await locator.click({ timeout: 4000 }); await locator.fill(''); await locator.fill(text); return; } catch {} }
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text, { delay: P.typeDelay }); await sleep(P.post);
};
const fill = async (page, locator, value, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y); await locator.fill(value); await sleep(P.post);
};
// Native <select>: focus + selectOption, NEVER a mouse click (popup reverts pick).
const pickSelect = async (page, locator, optionLabel, label) => {
  if (FAST) { await settleHydration(page); await locator.selectOption({ label: optionLabel }); return; }
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await locator.focus(); await locator.selectOption({ label: optionLabel }); await sleep(P.post);
};
const pickSelectContains = async (page, locator, text, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  const value = await locator.locator('option').filter({ hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`pickSelectContains(${label}): no option containing ${text}`);
  await locator.focus(); await locator.selectOption(value); await sleep(P.post);
};
const toast = async (page, text) => {
  try { await page.locator('.toast .alert').filter({ hasText: text }).first().waitFor({ timeout: 20000 });
    console.log(`      ✓ toast: "${text}"`); }
  catch { console.log(`      ⚠ toast NOT seen: "${text}"`); }
};
const waitToastClear = async (page) => {
  if (FAST) return;
  await page.waitForFunction(() => document.querySelectorAll('.toast .alert').length === 0,
    null, { timeout: 8000 }).catch(()=>{});
};
const openModalCancel = async (page) => {
  const dlg = page.locator('dialog.modal-open');
  await click(page, dlg.getByRole('button', { name: 'Cancel', exact: true }), 'close dialog');
};

--- 4.4 Nav helpers -----------------------------------------------------------
// navMap is GENERATED from the Phase-A route manifest (label → route builder).
const navDropdownParent = (name, navTree) => {
  for (const [parent, links] of Object.entries(navTree))
    if (links.some((l) => l.label === name)) return parent;
  return null;
};
const nav = async (page, name, urlRe, navTree) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitToastClear(page);
    const parent = navDropdownParent(name, navTree);
    if (parent) { try { await page.locator('header').getByText(parent, { exact: true }).first().hover(); await page.waitForTimeout(500); } catch {} }
    const link = page.getByRole('link', { name, exact: true }).first();
    await click(page, link, `nav → ${name}`);
    try { await page.waitForURL(urlRe, { timeout: 6000 }); await sleep(400);
      if (parent) { await page.mouse.move(6,6); await sleep(250); } return; }
    catch { console.log(`      ⚠ nav ${name} attempt ${attempt} — retrying`); await sleep(600); }
  }
  throw new Error(`nav to ${name} failed after 3 attempts`);
};

--- 4.5 reset fallback (used only when no DB snapshot exists) -----------------
async function resetViaForm(page, company, resetUrl) {
  if (!resetUrl) { console.log('      ⚠ no reset route + no snapshot — manual restore needed'); return; }
  log('RESET', `roll back ${company} via ${resetUrl}`);
  await page.goto(BASE_URL + resetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // The exact reset-form selectors vary by app; discover them from the scanned
  // reset page markup (Phase A) or fall back to the first form submit button.
}

===============================================================================
5. COVERAGE TAXONOMY — what the census MUST find, per route
===============================================================================
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
Plus nested/child elements discovered dynamically after each click (core
requirement): rows revealed in `following-sibling::tr` panels (their buttons,
selects, dates), controls inside `dialog.modal-open` (recurse, then close via
Cancel/Escape), items inside an opened `details.dropdown`, pagination/load-more,
keyboard navigation on active grids (ArrowUp/ArrowDown — verify the outline/
active class moves).

census(page):
  for each selector in CLICKABLE → for each visible instance → describe()
  (tag, text, tid, title, href) → skip anonymous/external/excluded → collect.

===============================================================================
6. THE SWEEP WALKER (embed as-is)
===============================================================================
const DESTRUCTIVE = /void|delete|remove|drop|purge|reset|disable|log ?out|sign ?out|изтри|изтрив|анулир/i;
const visited = new Set();        // key: route|sel|text|tid — never re-click same element
const routeQueue = new Set();     // URLs discovered during probes; crawled later

const describe = async (loc) => {
  const tag   = await loc.evaluate((n)=>n.tagName.toLowerCase()).catch(()=>'?');
  const text  = (await loc.innerText().catch(()=>''))?.trim().replace(/\s+/g,' ').slice(0,60);
  const tid   = await loc.getAttribute('data-testid').catch(()=>null);
  const title = await loc.getAttribute('title').catch(()=>null);
  const href  = await loc.getAttribute('href').catch(()=>null);
  return { tag, text, tid, title, href };
};

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
  if (el.d.tag === 'select') {                 // never mouse-click a native select
    rec.options = await el.loc.locator('option').count();
    const before = await el.loc.inputValue().catch(()=>null);
    if (DEEP_SELECTS) for (let i=1;i<rec.options;i++){ await el.loc.selectOption(i); await sleep(P.post); }
    if (before !== null) await el.loc.selectOption(before).catch(()=>{});
    rec.result = `select-enumerated (${rec.options} options)`; report.push(rec); return;
  }
  try { await click(page, el.loc, `sweep: ${label}`); }
  catch (e) { rec.result = 'click-failed: ' + String(e?.message ?? e).slice(0,160); report.push(rec); return; }
  if (await page.locator('dialog.modal-open').count()) {
    rec.result = 'modal-opened';
    for (const child of await census(page)) await probe(page, child, depth+1, report, counters);
    await page.locator('dialog.modal-open').getByRole('button', { name:'Cancel', exact:true })
      .first().click().catch(() => page.keyboard.press('Escape'));
  } else if (el.sel.includes('tbody tr')) {
    const panel = el.loc.locator('xpath=following-sibling::tr[1]');
    if (await panel.isVisible().catch(()=>false)) {
      rec.result = 'row-expanded';
      for (const child of await census(page)) await probe(page, child, depth+1, report, counters);
      await el.loc.locator('button').first().click().catch(()=>{});   // collapse back
    }
  } else {
    const fp2 = await fingerprint(page);
    if (fp2.url !== fp.url) {
      rec.result = 'navigated → ' + fp2.url;
      if (!fp2.url.startsWith('/login')) routeQueue.add(fp2.url);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(()=>{});
      await settleHydration(page);
    } else if (fp2.open > fp.open) {
      rec.result = 'dropdown-opened';
      await page.keyboard.press('Escape').catch(()=>{});
    } else if (fp2.rows > fp.rows) {
      rec.result = 'rows-revealed';
      for (const child of await census(page)) await probe(page, child, depth+1, report, counters);
    }
  }
  for (let t=0;t<2;t++) {                       // restore state; verify w/ fingerprint
    const now = await fingerprint(page);
    if (now.url === fp.url && now.dlg === fp.dlg) break;
    await page.keyboard.press('Escape').catch(()=>{});
    await page.locator('dialog.modal-open').getByRole('button',{name:'Cancel',exact:true}).first().click().catch(()=>{});
  }
  report.push(rec);
}

async function sweepRoute(page, url, report, counters, navTree) {
  await page.goto(BASE_URL + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await settleHydration(page);
  for (const parent of Object.keys(navTree)) {   // DaisyUI nav links render on hover
    await page.locator('header').getByText(parent, { exact:true }).first().hover().catch(()=>{});
    await sleep(300);
  }
  let elements = await census(page);
  let guard = 0;
  while (elements.length && guard++ < 8) {       // re-census: expansion reveals nodes
    const before = elements.length;
    for (const el of elements) await probe(page, el, 0, report, counters);
    elements = (await census(page)).filter((el) =>
      !visited.has(page.url()+'|'+el.sel+'|'+el.d.text+'|'+(el.d.tid ?? '')));
    if (elements.length >= before) break;
  }
  await shot(page, 'sweep-' + url.replace(/[^a-z0-9]+/gi,'_'));
}

Route crawl: seed routeQueue from the manifest routes + nav links + /companies
cards; drain it after scripted parts, appending URLs discovered by probes; cap
60 routes; skip 403/forbidden pages with a `skipped-forbidden` record.

===============================================================================
7. PARAM RESOLUTION FOR DYNAMIC ROUTES
===============================================================================
Manifest routes with `:param` need a concrete value before crawling. Resolve in
order; use the first that yields a value:
  1. --param name=value CLI overrides.
  2. Seed/DB scan: grep seed/** or query the SQLite file for a real value
     (company code, user id, entity id).
  3. Live discovery: navigate to the nearest listing route and capture the first
     matching link href (e.g. open /companies, read the first card's href).
If none resolves, record the route as `skipped-unresolvable` and continue.

===============================================================================
8. HARD-WON ROBUSTNESS RULES (do NOT skip)
===============================================================================
- Hydration race: after EVERY navigation run settleHydration() before clicking;
  on click failure retry once after another settle.
- Toast overlays swallow navbar clicks: waitToastClear() before nav clicks; after
  a save verify the exact success toast (toast() logs ✓/⚠, never hard-fails).
- Native <select>: focus + selectOption(), never a mouse click; verify
  option:checked afterwards.
- Expand vs toggle: check details.open / panel visibility before clicking a
  summary/row toggle, so you never collapse what a previous step opened.
- Destructive guard: skip-and-report anything matching DESTRUCTIVE unless
  --allow-destructive. Posted documents get VOIDED with a reason, never
  hard-deleted.
- Downloads/popups: wrap in page.waitForEvent('download'|'popup'), close popup
  pages, log suggestedFilename().
- POST watcher + console forwarding in main() (§9).
- Exit: print the stack BEFORE browser.close(); use process.exitCode = 1; NEVER
  process.exit() (it truncates stdout on Windows pipes).
- Snapshot before you sweep: backupDatabase() runs before the browser opens and
  its restore is the FIRST rollback attempt, on success AND on failure.

===============================================================================
9. main() PLUMBING
===============================================================================
- viewport 1440×900; context.addInitScript(CURSOR_JS).
- backupDatabase() as the very first call (before chromium.launch()).
- goto BASE_URL → login (retry ×3) using scanned login selectors + creds.
- select company (--company or first card).
- Run scripted PARTS (respecting --from/--until), then drain routeQueue via
  sweepRoute() (respecting --max-clicks).
- page.on('response'): log every POST status; if body.type === 'failure', print
  the action + data (surface server action errors the toast check misses).
- page.on('console'): forward `[debug-*]` lines to stdout.
- End of run (success) AND catch block (failure): restore snapshot first,
  resetViaForm fallback second, manual-restore hint third.
- Write coverage.json + coverage.md EVEN on failure.

===============================================================================
10. COVERAGE REPORT (always written)
===============================================================================
plan/replay/coverage.json:
  { "routes": N, "elements": N, "clicked": N, "skipped-destructive": N,
    "failed": N, "modals": N, "row-expansions": N, "selects": N,
    "records": [ { route, sel, text, tid, result, depth } ] }
plan/replay/coverage.md: per-route table + a FAILED / SKIPPED section. Every
failed record must name route + selector + text so the fix is one locator edit.

===============================================================================
11. RUNBOOK
===============================================================================
1. Prereqs: dev server on a free port; DB at a known baseline; login works.
2. Scan: the skill reads the source tree and writes plan/replay/manifest.json.
3. Emit: write plan/replay/replay-all.mjs from the embedded blocks.
4. Snapshot: automatic (backupDatabase) as long as --db-path resolved.
5. Smoke: --fast --headless --mode sweep → fix every reported locator, re-run.
6. Recording: default pace, window visible (or OBS), optional --shot-dir.
7. Rollback: snapshot restored automatically at end (success OR failure); only
   when no --db-path was given does it fall back to resetViaForm — else tell the
   user to restore manually.
8. Deliver: plan/replay/coverage.md — X routes, Y elements, Z clicked, every
   failure listed with its selector.

===============================================================================
12. FAILURE HANDLING
===============================================================================
- Stop the sweep on the FIRST unrecoverable locator error, naming route/selector.
- Attempt DB rollback: snapshot restore first, reset-form fallback second.
- Print the stack before closing the browser; process.exitCode = 1.
- Never hard-delete posted documents (void with reason instead).
- Admin-gated route (401/403) → record skipped-forbidden, continue.
- If the sweep budget (--max-clicks) is hit, write the partial report and exit 0
  with a note — partial coverage is still a deliverable.