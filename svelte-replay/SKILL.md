---
name: svelte-replay
description: >
  Self-contained, zero-dependency generator of recorded, cursor-visible Playwright
  replay scripts for ANY SvelteKit app. Scans the whole codebase (routes, server
  actions, endpoints, navbar, login form, DB file) to build a manifest from scratch,
  then emits ONE Node ESM script that exhaustively sweeps every route, button, link,
  tab, dropdown, modal, select, checkbox and expandable row — recursing into every
  child element revealed — with a gliding in-page cursor overlay, DB snapshot/restore
  safety net, heartbeat liveness logging, and a coverage report. Use when asked to
  "replay the app", "test every button/clickable", "full UI coverage sweep", or
  "build a demo recording from scratch". All outputs live under plan/replay/.
---

svelte-replay — full-app recorded replay + exhaustive UI sweep (v2.4, self-contained)

===============================================================================
CHANGELOG (v2 → v2.1 — bugfix pass)
===============================================================================
- FIXED: modal detection relied only on `dialog.modal-open`. Current daisyUI
  modals (`<dialog class="modal">` + `.showModal()`) only ever get the native
  `open` attribute — never a `modal-open` class — so the sweep never recognized
  a modal had opened, never recursed into it, and never closed it. Selector is
  now `dialog[open], .modal-open` (covers current daisyUI + the older
  checkbox/anchor-hack pattern) everywhere a modal is detected or closed.
- FIXED: the visited-element dedup key (`sel|text|tid`) collapsed onto itself
  for any set of identical sibling controls with no data-testid — e.g. an
  "Edit" button repeated once per table row. Only the first row's button was
  ever probed; every other row was silently skipped. Key now also includes the
  element's census index and href: `sel|i|text|tid|href`.
- FIXED: `PARTS.slice(FROM, UNTIL_ARG)` — when `--until` isn't passed,
  `UNTIL_ARG` is `null`, and `Array.prototype.slice` coerces a `null` end
  argument to `0` (not "end of array" the way `undefined` would). Net effect:
  the scripted PARTS phase silently ran zero parts on every default `--mode
  both`/`scripted` run. `UNTIL` is now derived explicitly after PARTS exists.
- FIXED: census() dropped any element that had only an `aria-label` and no
  visible text/title/href/testid (common for icon-only buttons) — such
  elements were never probed at all, so an icon-only "Edit" control was
  silently skipped rather than swept. census() now also captures `aria-label`
  and treats it as a valid identifying signal.
- FIXED (safety, paired with the above): because icon-only controls are now
  swept, the DESTRUCTIVE guard now also tests `aria-label`, not just
  text/title — otherwise a newly-swept icon-only delete button could bypass
  the destructive-action skip.
- REMOVED: a dead, unused line in probe() (`const key = ... el.d?.text ...`)
  left over from an earlier revision — `el.d` never existed on the census
  element shape; the real dedup key was always the next line (`k`).
- HARDENED: --selftest now also asserts `resolveParam` exists (§6 describes
  it but v2's selftest checklist never checked for it), and asserts that
  every interaction helper (click/type/fill/pickSelect/pickSelectContains)
  literally contains `glide(` in its source — so the gliding-cursor
  requirement is verified mechanically, not just by convention.

===============================================================================
CHANGELOG (v2.1 → v2.2 — visibility/speed decoupling + row-sweep widening)
===============================================================================
- FIXED: `FAST` was computed as `has('fast') && HEADLESS`, so `--fast` alone
  in a normal (headed) run did nothing — the browser was correctly visible
  by default, but the cursor still crawled at full pace unless `--headless`
  was also passed, and the code printed a warning telling the user their
  `--fast` flag was being ignored. Visibility and speed are orthogonal
  concerns: `HEADLESS` (default off — visible unless `--headless` is
  explicitly passed) controls whether a window is shown at all; `FAST`
  (`= has('fast')`, no longer ANDed with `HEADLESS`) controls only how
  quickly the visible cursor glides. The "⚠ --fast ignored in headed mode"
  warning is removed since it's no longer true.
- FIXED: `P`'s FAST branch zeroed `moveStep`/`settle`/`post`/`between`
  entirely, which — combined with the next bug below — meant "fast" really
  meant "cursor invisible/instant", not "cursor fast". FAST now uses small
  but non-zero timings so the glide animation still plays, just quickly.
- FIXED: `glide()`, `click()`, `type()`, and `pickSelect()` each had a
  `if (FAST) { ...; return; }` branch that bypassed the step-animation
  entirely and drove the page with a raw `locator.click()`/`selectOption()`
  (or, in `glide()`'s case, a single instant `page.mouse.move()`). Under
  `--fast` the in-page cursor overlay silently stopped tracking real
  interactions, contradicting this doc's own GLIDE GUARANTEE. These
  branches are removed — every helper now unconditionally calls `glide()`
  and lets `P` (not a helper-level branch) control speed.
- FIXED: `nav()` had the same problem one level up — its FAST branch
  replaced the click-through-the-actual-link flow with `page.goto()`,
  meaning under `--fast` the nav link itself was never clicked/tested at
  all, undermining "sweep every clickable element". `nav()` now always
  drives the click via `click()` (glide included), just faster under FAST.
- WIDENED: `CLICKABLE`'s row entries were `tbody tr:has(button)` and
  `tbody tr[data-expandable]`, so a row that expands purely from a
  row-level click handler — no inner `<button>`, no `data-expandable`
  attribute — was never censused and therefore never probed, and whatever
  children it revealed were never swept either. Replaced with the plain
  `tbody tr` (a strict superset of both narrower forms) so every row, and
  every clickable revealed inside it once expanded, gets probed via the
  existing row-expanded recursion in §5 `probe()`.
- FIXED (follow-on): the row-collapse step after `row-expanded` assumed a
  nested `<button>` always existed to re-click and close the row — true
  for `:has(button)` rows, not for the row-level-click rows the widening
  above now also sweeps. It now clicks a nested button if one exists, and
  falls back to re-clicking the row itself when it doesn't.

===============================================================================
CHANGELOG (v2.2 → v2.3 — fast is now the default)
===============================================================================
- CHANGED: `--fast` is removed. Fast pacing (the small-but-nonzero P
  timings introduced in v2.2) is now the DEFAULT for every run — headed
  or headless. Added `--normal`, which opts INTO the old slow, deliberate
  cursor pace meant for an actual screen-recorded demo. Polarity flip:
  `const FAST = !has('normal')`. As before, this is independent of
  HEADLESS — `--normal` never implies `--headless` and vice versa.
- Practical effect: a plain `node plan/replay/replay-all.mjs` (no flags)
  now sweeps at fast pace with the browser visible. For a demo recording,
  pass `--normal` to slow the glide back down to a watchable pace. For a
  headless CI/agent smoke run, no flag is needed — fast + headed-by-
  default was already the common case; add `--headless` on top of that
  as before, `--normal` alone if you also want to slow it down.

===============================================================================
CHANGELOG (v2.3 → v2.4 — bounded actionability timeouts on header-dependent calls)
===============================================================================
- FIXED (found live, by an agent run): `sweepRoute()`'s per-route loop that
  hovers over every `NAV_TREE` parent (to pop dropdown children into view
  for census) called `.hover()` with no explicit `timeout` — only a bare
  `.catch(() => {})`. On any route that doesn't render the standard
  dashboard `<header>` (e.g. login, an error page, a print/export view,
  anything outside the authenticated shell), Playwright falls back to its
  default 30s actionability timeout before the locator gives up and the
  catch swallows it. That's up to `30s × (number of NAV_TREE parents)` of
  silent dead time on every header-less route, with nothing printed to
  say why the run is stalled — it just looks hung.
- Same defect, smaller blast radius, in two more places: `nav()`'s single
  hover-to-open-dropdown call, and the modal `Cancel`-button fallback
  click in `probe()`'s dialog-close loop (run up to twice per probe).
  Both also relied on the bare default timeout behind a `.catch()`.
- All three now pass an explicit `{ timeout: 1500 }` so a missing target
  fails fast instead of silently eating up to 30s. Rule going forward:
  any Playwright action wrapped in a bare `.catch(() => {})` — i.e. "this
  might legitimately not exist, that's fine" — MUST carry its own
  explicit `timeout`. A caught failure should cost low seconds, not up
  to 30s, or "expected to sometimes fail" quietly turns into "silently
  stalls the whole run." (Applied the same fix to `resetViaForm()`'s
  fallback submit-button click while auditing for this pattern — same
  defect, lower blast radius since it only runs once at rollback time.)

===============================================================================
0. ZERO-DEPENDENCY PRINCIPLE
===============================================================================
Works with NO pre-existing replay/demo/test file. Never read, import or require
any *.mjs from the target repo. All code the generated script needs is embedded
INLINE in §4-§6 of this document — copy it verbatim into the emitted script.
All outputs under plan/replay/ (script, db-backups/, shots/, coverage.*,
manifest.json, run.log). User adds one .gitignore line: plan/replay/.

===============================================================================
1. PHASE A — CODEBASE SCAN (manifest from scratch)
===============================================================================
Static scan only (globs + regex; never execute app code). Write the results as
a JS const MANIFEST embedded in the generated script AND to
plan/replay/manifest.json:

A1 ROUTES: glob src/routes/**/+page.svelte → paths; [p] → :p, [...p] → *p.
A2 ACTIONS: +page.server.ts `export const actions` names per route.
A3 ENDPOINTS: +server.ts GETs that return files (downloads) — sweep fetches
   them in-page instead of navigating.
A4 LOGIN: route + selectors scanned from the login markup
   (input ids/names/types, submit button text). Fallbacks if scan finds
   nothing: #login-email / #login-password / button "Log in".
A5 NAVBAR: header/nav component → NAV_TREE = { '': [top-level links],
   'Parent': [{label, href}...] }. Drives hover-open + seeds the route queue.
A6 DB: grep for sqlite path (dev.db|*.sqlite|DB_PATH|better-sqlite3) → dbGuess.
   Also detect reset route (reset|restore-baseline) → resetHint.
A7 Per-route <select>/dialog/details density (advisory for the report).

===============================================================================
2. PHASE B — EMIT plan/replay/replay-all.mjs
===============================================================================
One Node ESM file. Imports ONLY: playwright, node:fs, node:path.
Order: (1) CLI parsing §3, (2) MANIFEST const, (3) backup/restore §4.6,
(4) embedded blocks §4, (5) census/probe/sweep §5, (6) param resolution §6,
(7) PARTS array (empty by default) — immediately followed by the UNTIL
derivation (see §3), (8) main() §7.

MANDATORY PRE-RUN GATES (tell the user to run all three):
  node --check plan/replay/replay-all.mjs          # syntax
  node plan/replay/replay-all.mjs --selftest       # wiring, no browser/app
  node plan/replay/replay-all.mjs --headless --mode sweep --max-clicks 20
                                                   # real-scenario smoke (fast is default)
Only after all three pass: headed recording run (--normal, no --headless).

===============================================================================
3. CLI (all flags must exist and be parsed)
===============================================================================
--base-url --user --pass --company --db-path --backup-dir --skip-backup
--reset-url --mode sweep|scripted|both (default both) --from N --until N
--max-clicks N (2000) --allow-destructive --exclude TEXT (repeatable)
--deep-selects --month YYYY-MM --shot-dir DIR --param name=value (repeatable)
--normal --headless --selftest

CRITICAL: const FAST = !has('normal');  // fast is the DEFAULT; --normal opts into recording pace
Visibility and speed are two different flags, never conflate them:
  - HEADLESS (`has('headless')`) — default OFF, so the browser is VISIBLE
    by default. Only `--headless` hides the window.
  - FAST (`!has('normal')`) — default ON. Controls ONLY the pacing
    constants in P (§4.1). It never disables glide(), never skips a
    helper's cursor movement, and never swaps a click for a raw locator
    call — every run glides to and clicks every element visibly by
    default, it's just quick. Pass `--normal` to slow the cursor down to
    a deliberate, watchable pace for an actual screen-recorded demo.
  - `--normal` never implies `--headless` and `--headless` never implies
    `--normal` — independent knobs, same as before the polarity flip.
(See CHANGELOG v2.1→v2.2 for why these two were never the same knob, and
v2.2→v2.3 for why FAST's default flipped from off to on.)

CRITICAL: `--until` must NOT be used raw. `val('until', null)` yields `null`
when the flag is absent, and `Array.prototype.slice(begin, null)` coerces
`null` to `0` — NOT "end of array" the way `undefined` would — so
`PARTS.slice(FROM, UNTIL_ARG)` silently runs zero scripted parts by default.
Immediately after PARTS is declared (§2 step 7), derive:
  const UNTIL = UNTIL_ARG != null ? parseInt(UNTIL_ARG, 10) : PARTS.length;
and use `PARTS.slice(FROM, UNTIL)` everywhere (§7). Never reference
UNTIL_ARG directly outside this derivation.

===============================================================================
4. EMBEDDED BLOCKS (copy verbatim)
===============================================================================
--- 4.1 imports + CLI ---
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const val = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : (args[i + 1] ?? true); };
const list = (n) => { const o = []; for (let i = 0; i < args.length; i++) if (args[i] === '--' + n) o.push(args[i + 1]); return o; };
const HEADLESS = has('headless');   // default: visible. Only --headless hides the window.
const FAST = !has('normal');        // default: fast. Pass --normal for the slow, recording-pace cursor.
const BASE_URL = val('base-url', 'http://localhost:5173');
const USER = val('user', '1'); const PASS = val('pass', '1');
const COMPANY = val('company', null);
const DB_PATH = val('db-path', process.env.DB_PATH ?? null);
const BACKUP_DIR = val('backup-dir', 'plan/replay/db-backups');
const SKIP_BACKUP = has('skip-backup');
const RESET_URL = val('reset-url', null);
const MODE = val('mode', 'both');
const FROM = Math.max(0, parseInt(val('from', '0'), 10) || 0);
const UNTIL_ARG = val('until', null);   // resolve to UNTIL only after PARTS exists — see §3/§7
const MAX_CLICKS = parseInt(val('max-clicks', '2000'), 10) || 2000;
const ALLOW_DESTRUCTIVE = has('allow-destructive');
const EXCLUDES = list('exclude');
const DEEP_SELECTS = has('deep-selects');
const MONTH = val('month', new Date().toISOString().slice(0, 7));
const SHOT_DIR = val('shot-dir', null);
const PARAM_OVERRIDES = Object.fromEntries(list('param').map((s) => { const [k, ...v] = s.split('='); return [k, v.join('=')]; }));
const P = FAST ? { moveStep: 2, settle: 40, typeDelay: 4, post: 90, between: 200 }
               : { moveStep: 14, settle: 280, typeDelay: 50, post: 550, between: 1300 };
// FAST never zeroes these out — a 0ms moveStep collapses glide()'s per-step
// sleep to nothing, which is indistinguishable from the cursor teleporting.
// Small-but-nonzero keeps every glide visibly animated, just fast.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (part, msg) => console.log(`\n▶ ${part} — ${msg}`);
let PHASE = 'boot'; const C = { clicks: 0 };
setInterval(() => console.log(`      … [alive] ${PHASE} — clicks ${C.clicks}/${MAX_CLICKS}`), 10000).unref();
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
const shot = async (page, name) => { if (!SHOT_DIR) return; const p = path.join(SHOT_DIR, name + '.png'); await page.screenshot({ path: p }); console.log(`      📸 ${p}`); };

--- 4.2 CURSOR_JS v2 (centered start + idle pulse; OBS-capturable) ---
const CURSOR_JS = `
(() => {
  if (window.__replayCursorEl) return;
  const injectStyle = () => {
    if (document.getElementById('replay-cursor-style')) return;
    const st = document.createElement('style');
    st.id = 'replay-cursor-style';
    st.textContent = '@keyframes rc-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }';
    (document.head ?? document.documentElement)?.appendChild(st);
  };
  const build = () => {
    if (window.__replayCursorEl) return window.__replayCursorEl;
    injectStyle();
    const el = document.createElement('div');
    el.id = 'replay-cursor';
    el.style.cssText =
      'position:fixed;left:50%;top:50%;width:24px;height:24px;pointer-events:none;' +
      'z-index:2147483647;filter:drop-shadow(0 1px 2px rgba(0,0,0,.65));';
    el.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" stroke="#111111" stroke-width="1.4" stroke-linejoin="round" style="animation:rc-pulse 1.2s infinite">' +
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
  // Defensive re-attach: SvelteKit client-side transitions shouldn't touch
  // document.body, but if a full re-render ever detaches the overlay, the
  // next mousemove's ensure() call above rebuilds it — no extra wiring
  // needed as long as callers keep driving real mouse movement via glide().
})();
`;

--- 4.3 interaction helpers (FAST only tightens P's timings — never bypasses glide) ---
GLIDE GUARANTEE: every helper below calls glide() before acting, unconditionally.
No helper has a FAST-mode early return that swaps in a raw locator.click()/
selectOption()/page.goto() — FAST's only effect is shorter P.moveStep/settle/
typeDelay/post/between (§4.1), so the in-page cursor still visibly glides to
and interacts with every element, just quickly instead of at recording pace.
--selftest (§7) asserts this mechanically by checking each helper's source
for the substring 'glide(' — do not refactor a helper to move the mouse any
other way, and do not reintroduce a `if (FAST) { ...; return; }` bypass, or
the in-page cursor overlay will silently stop tracking real interactions.
const center = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box (hidden?)');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const glide = async (page, x, y) => {
  const cur = await page.evaluate(() => ({ x: window.__curX ?? innerWidth / 2, y: window.__curY ?? innerHeight / 2 }));
  const steps = Math.max(1, Math.min(80, Math.ceil(Math.hypot(x - cur.x, y - cur.y) / 26)));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cur.x + ((x - cur.x) * i) / steps, cur.y + ((y - cur.y) * i) / steps);
    await sleep(P.moveStep);
  }
  await page.evaluate(([a, b]) => { window.__curX = a; window.__curY = b; }, [x, y]);
};
const settleHydration = async (page) => {           // ONLY once per navigation
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}
  await page.waitForTimeout(250);
};
const click = async (page, locator, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y); await sleep(P.post);
};
const type = async (page, locator, text, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text, { delay: P.typeDelay }); await sleep(P.post);
};
const fill = async (page, locator, value, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await page.mouse.click(c.x, c.y); await locator.fill(value); await sleep(P.post);
};
const pickSelect = async (page, locator, optionLabel, label) => {   // glide there, then focus+selectOption — NEVER mouse-click the option list itself
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await locator.focus(); await locator.selectOption({ label: optionLabel }); await sleep(P.post);
  const picked = await locator.locator('option:checked').textContent().catch(() => null);
  if (picked !== optionLabel) console.log(`      ⚠ pickSelect(${label}) landed on ${JSON.stringify(picked)}`);
};
const pickSelectContains = async (page, locator, text, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  const value = await locator.locator('option').filter({ hasText: text }).first().getAttribute('value');
  if (!value) throw new Error(`pickSelectContains(${label}): no option containing ${text}`);
  await locator.focus(); await locator.selectOption(value); await sleep(P.post);
};
const toast = async (page, text) => {
  try { await page.locator('.toast .alert').filter({ hasText: text }).first().waitFor({ timeout: 20000 }); console.log(`      ✓ toast: "${text}"`); }
  catch { console.log(`      ⚠ toast NOT seen: "${text}"`); }
};
const waitToastClear = async (page) => {
  if (FAST) return;
  await page.waitForFunction(() => document.querySelectorAll('.toast .alert').length === 0, null, { timeout: 8000 }).catch(() => {});
};
const openModalCancel = async (page) => {
  await click(page, page.locator('dialog[open], .modal-open').getByRole('button', { name: 'Cancel', exact: true }), 'close dialog');
};

--- 4.4 nav (NAV_TREE generated from scan; signature (page,name,urlRe)) ---
const navDropdownParent = (name) => {
  for (const [parent, links] of Object.entries(NAV_TREE))
    if (parent && links.some((l) => l.label === name)) return parent;
  return null;
};
const nav = async (page, name, urlRe) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitToastClear(page);
    const parent = navDropdownParent(name);
    if (parent) {
      await page.locator('header').getByText(parent, { exact: true }).first()
        .hover({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await click(page, page.getByRole('link', { name, exact: true }).first(), `nav → ${name}`);
    try {
      await page.waitForURL(urlRe, { timeout: 6000 }); await sleep(400);
      if (parent) { await page.mouse.move(6, 6); await sleep(250); }   // close dropdown
      return;
    } catch { console.log(`      ⚠ nav ${name} attempt ${attempt} — retrying`); await sleep(600); }
  }
  throw new Error(`nav to ${name} failed after 3 attempts`);
};

--- 4.5 reset fallback (only when no snapshot) ---
async function resetViaForm(page) {
  if (!RESET_URL) { console.log('      ⚠ no snapshot + no --reset-url — restore manually from ' + BACKUP_DIR); return; }
  log('RESET', 'roll back via ' + RESET_URL);
  await page.goto(BASE_URL + RESET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const submit = page.locator('form button[type="submit"], form button').first();
  await submit.click({ timeout: 3000 }).catch(() => {});
  await sleep(3000);
}

--- 4.6 DB snapshot/restore (v2: also removes stale -wal/-shm) ---
function backupDatabase() {
  if (SKIP_BACKUP) { console.log('⚠ --skip-backup: no DB snapshot'); return null; }
  if (!DB_PATH || !existsSync(DB_PATH)) { console.log(`⚠ --db-path file missing (${DB_PATH}) — rollback relies on reset form`); return null; }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12);
  const files = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm'].filter(existsSync);
  for (const f of files) copyFileSync(f, path.join(BACKUP_DIR, stamp + '.' + path.basename(f)));
  console.log(`✓ DB snapshot → ${BACKUP_DIR}/${stamp}.* (${files.length} file(s))`);
  return stamp;
}
function restoreDatabaseBackup(stamp) {
  if (!stamp || !DB_PATH) return false;
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    const b = path.join(BACKUP_DIR, stamp + '.' + path.basename(f));
    if (existsSync(b)) copyFileSync(b, f);
    else if (existsSync(f)) rmSync(f);          // drop stale WAL/SHM the backup never had
  }
  console.log('✓ DB restored from snapshot (restart dev server if it held a stale WAL)');
  return true;
}

===============================================================================
5. SWEEP (v2.1: batched census = ONE evaluate; heartbeat-labeled phases)
===============================================================================
const CLICKABLE = [
  'button:not([disabled])', 'a[href]:not([aria-disabled="true"])', '[role="button"]',
  'summary', 'input[type="checkbox"]:not([disabled])', 'input[type="radio"]:not([disabled])',
  'select:not([disabled])', 'tbody tr',
  '[data-testid]', '.dropdown > div[role="button"]', 'ul li button', '[role="tab"]',
];
// 'tbody tr' is deliberately every row, not just `:has(button)` or
// `[data-expandable]` — a row that expands purely from a row-level click
// handler (no inner button, no data-expandable attribute) still needs to be
// censused, or it and everything it reveals on expand are never probed.
// Extend this with any target-app-specific "delete/void/etc" words found in
// the scanned codebase (§1 A7) instead of hardcoding a fixed language list.
const DESTRUCTIVE = /void|delete|remove|drop|purge|reset|disable|log ?out|sign ?out/i;
const visited = new Set(); const routeQueue = new Set();
async function census(page) {
  const t0 = Date.now();
  const raw = await page.evaluate((sels) => {
    const out = []; const seen = new Set();
    for (const sel of sels) {
      [...document.querySelectorAll(sel)].slice(0, 80).forEach((n, i) => {
        if (seen.has(n)) return; seen.add(n);
        const r = n.getBoundingClientRect(); if (!r.width || !r.height) return;
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        out.push({ sel, i, tag: n.tagName.toLowerCase(),
          text: (n.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
          tid: n.getAttribute('data-testid'), title: n.getAttribute('title'),
          aria: n.getAttribute('aria-label'), href: n.getAttribute('href') });
      });
    }
    return out;
  }, CLICKABLE);
  const els = raw
    .filter((d) => d.text || d.tid || d.title || d.aria || d.href)   // aria-label counts as a signal — icon-only controls must not be silently dropped
    .filter((d) => !(d.href && /^(https?:|mailto:)/.test(d.href)))
    .filter((d) => !EXCLUDES.some((x) => JSON.stringify(d).includes(x)))
    .map((d) => ({ ...d, loc: page.locator(d.sel).nth(d.i) }));
  console.log(`      [census] ${els.length} elements in ${Date.now() - t0}ms`);
  return els;
}
const dedupKey = (page, el) => page.url() + '|' + el.sel + '|' + el.i + '|' + el.text + '|' + (el.tid ?? '') + '|' + (el.href ?? '');
const fingerprint = (page) => page.evaluate(() => ({
  url: location.pathname + location.search,
  dlg: document.querySelectorAll('dialog[open], .modal-open').length,
  rows: document.querySelectorAll('tbody tr').length,
  open: document.querySelectorAll('details[open]').length,
}));
async function probe(page, el, depth, report) {
  if (C.clicks >= MAX_CLICKS || depth > 6) return;
  const k = dedupKey(page, el);
  if (visited.has(k)) return; visited.add(k);
  const rec = { route: page.url(), sel: el.sel, text: el.text, tid: el.tid, depth, result: 'clicked' };
  PHASE = 'probe: ' + (el.text || el.tid || el.sel);
  if (DESTRUCTIVE.test(`${el.text} ${el.title ?? ''} ${el.aria ?? ''}`) && !ALLOW_DESTRUCTIVE) { rec.result = 'skipped-destructive'; report.push(rec); return; }
  const fp = await fingerprint(page);
  C.clicks++;
  if (el.tag === 'select') {
    const before = await el.loc.inputValue().catch(() => null);
    const opts = await el.loc.locator('option').count();
    if (DEEP_SELECTS) for (let i = 1; i < opts; i++) { await el.loc.selectOption(i); await sleep(P.post); }
    if (before !== null) await el.loc.selectOption(before).catch(() => {});
    rec.result = `select-enumerated (${opts} options)`; report.push(rec); return;
  }
  try { await click(page, el.loc, 'sweep: ' + (el.text || el.sel)); }
  catch (e) { rec.result = 'click-failed: ' + String(e?.message ?? e).slice(0, 160); report.push(rec); return; }
  if (await page.locator('dialog[open], .modal-open').count()) {
    rec.result = 'modal-opened';
    for (const child of await census(page)) await probe(page, child, depth + 1, report);
    await page.locator('dialog[open], .modal-open').getByRole('button', { name: 'Cancel', exact: true }).first().click().catch(() => page.keyboard.press('Escape'));
  } else if (el.sel.includes('tbody tr')) {
    const panel = el.loc.locator('xpath=following-sibling::tr[1]');
    if (await panel.isVisible().catch(() => false)) {
      rec.result = 'row-expanded';
      for (const child of await census(page)) await probe(page, child, depth + 1, report);
      // Collapse it back: prefer a nested toggle button if one exists, else
      // the row itself was the click target (row-level handler, no inner
      // button) — re-click the row to close it.
      const collapseBtn = el.loc.locator('button').first();
      if (await collapseBtn.count().catch(() => 0)) await collapseBtn.click().catch(() => {});
      else await el.loc.click().catch(() => {});
    }
  } else {
    const fp2 = await fingerprint(page);
    if (fp2.url !== fp.url) {
      rec.result = 'navigated → ' + fp2.url;
      if (!fp2.url.startsWith('/login')) routeQueue.add(fp2.url);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await settleHydration(page);
    } else if (fp2.open > fp.open) { rec.result = 'dropdown-opened'; await page.keyboard.press('Escape').catch(() => {}); }
    else if (fp2.rows > fp.rows) { rec.result = 'rows-revealed'; for (const child of await census(page)) await probe(page, child, depth + 1, report); }
  }
  for (let t = 0; t < 2; t++) {
    const now = await fingerprint(page);
    if (now.url === fp.url && now.dlg === fp.dlg) break;
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('dialog[open], .modal-open').getByRole('button', { name: 'Cancel', exact: true }).first()
      .click({ timeout: 1500 }).catch(() => {});
  }
  report.push(rec);
}
async function sweepRoute(page, url, report) {
  PHASE = 'sweep goto ' + url;
  await page.goto(BASE_URL + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await settleHydration(page);                       // once per navigation ONLY
  for (const parent of Object.keys(NAV_TREE)) {
    if (!parent) continue;
    await page.locator('header').getByText(parent, { exact: true }).first()
      .hover({ timeout: 1500 }).catch(() => {});
    await sleep(300);
  }
  let elements = await census(page); let guard = 0;
  while (elements.length && guard++ < 8) {
    const before = elements.length;
    for (const el of elements) await probe(page, el, 0, report);
    elements = (await census(page)).filter((el) => !visited.has(dedupKey(page, el)));
    if (elements.length >= before) break;
  }
  await shot(page, 'sweep-' + url.replace(/[^a-z0-9]+/gi, '_'));
}
function writeCoverage(report) {
  const stats = { routes: new Set(report.map((r) => r.route)).size, elements: report.length,
    clicked: report.filter((r) => r.result === 'clicked' || r.result.startsWith('select')).length,
    'skipped-destructive': report.filter((r) => r.result === 'skipped-destructive').length,
    failed: report.filter((r) => r.result.startsWith('click-failed')).length };
  mkdirSync('plan/replay', { recursive: true });
  writeFileSync('plan/replay/coverage.json', JSON.stringify({ ...stats, records: report }, null, 2));
  writeFileSync('plan/replay/coverage.md', '# Coverage\n\n' + Object.entries(stats).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
    '\n\n## Failed / skipped\n' + report.filter((r) => r.result.startsWith('click-failed') || r.result === 'skipped-destructive')
      .map((r) => `- ${r.route} | ${r.sel} | ${r.text} | ${r.result}`).join('\n'));
  console.log('\n✓ coverage written: plan/replay/coverage.{json,md} — ' + JSON.stringify(stats));
}

===============================================================================
6. PARAM RESOLUTION + WARM-UP
===============================================================================
resolveParam(route, cid): 1) PARAM_OVERRIDES[name]; 2) cid if known;
3) live: goto nearest param-less prefix, read first a[href] matching the route
shape; else return null → record {route, result:'skipped-unresolvable'}.
This MUST be implemented as an actual named function `resolveParam` — it is
now part of the --selftest wiring check (§7), so a generated script that
only describes this logic in a comment will fail --selftest instead of
silently shipping with unresolvable dynamic routes.
concreteRoutes = every static (param-less) manifest route, plus every dynamic
route for which resolveParam() returned a non-null id for each of its params.
Warm-up pass BEFORE the crawl (kills cold-SSR compile stalls):
  for (const r of concreteRoutes.slice(0, 60)) { PHASE = 'warm ' + r;
    await page.goto(BASE_URL + r, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    console.log('      [warm] ' + r); }

===============================================================================
7. main() PLUMBING
===============================================================================
- Immediately after the PARTS array (empty by default) is declared:
    const UNTIL = UNTIL_ARG != null ? parseInt(UNTIL_ARG, 10) : PARTS.length;
  (See §3 CRITICAL note — never slice with UNTIL_ARG directly.)
- --selftest: assert typeof === 'function' for [glide,click,type,fill,pickSelect,
  pickSelectContains,toast,census,probe,sweepRoute,nav,backupDatabase,
  restoreDatabaseBackup,resetViaForm,fingerprint,center,settleHydration,
  waitToastClear,openModalCancel,shot,writeCoverage,resolveParam]; assert
  CURSOR_JS contains 'replay-cursor' and 'rc-pulse'; assert CLICKABLE.length
  >= 10; assert each of click.toString(), type.toString(), fill.toString(),
  pickSelect.toString(), pickSelectContains.toString() contains 'glide(' —
  this is what guarantees the recorded cursor actually tracks every
  interaction rather than just existing as an unused overlay; print
  PASS/FAIL; process.exitCode = missing.length ? 1 : 0; return WITHOUT
  launching a browser.
- stamp = backupDatabase();  process.on('SIGINT', () => { restoreDatabaseBackup(stamp); process.exit(130); });
- chromium.launch({ headless: HEADLESS }); context viewport 1440×900;
  await context.addInitScript(CURSOR_JS);  (context FIRST, then newPage —
  addInitScript re-injects on every subsequent full navigation in this
  context automatically, so a single call before the first page covers the
  whole run, including any hard reloads.)
- page.on('response'): log POSTs; on body.type==='failure' print action+data.
  page.on('console'): forward [debug-*] lines.
- login ×3 with scanned selectors (via type()/click(), so the login flow is
  gliding and cursor-visible too — never bypass the helpers here even though
  it happens before the main sweep). Select company (--company or first card).
- MODE scripted/both → PARTS.slice(FROM, UNTIL); MODE sweep/both → warm-up +
  drain routeQueue (seed: manifest routes resolved via resolveParam +
  NAV_TREE hrefs + /companies cards; cap 60; 401/403 → skipped-forbidden).
- END: writeCoverage(report); rollback = restoreDatabaseBackup(stamp) ||
  resetViaForm(page) || manual hint. SAME in catch. Print stack BEFORE
  browser.close(); process.exitCode = 1; NEVER process.exit() (except SIGINT).

===============================================================================
8. ROBUSTNESS / REPORT / RUNBOOK / FAILURE (unchanged from v1, still mandatory)
===============================================================================
- Hydration: settleHydration once per navigation; retry-once after settle on
  click failure. Toasts: waitToastClear before nav; toast() logs ✓/⚠.
- <select>: focus+selectOption only. Expand-vs-toggle: check details.open first.
- Modal detection: `dialog[open], .modal-open` — covers current daisyUI
  (native <dialog>+showModal, no class change) and the legacy checkbox/anchor
  hack (`.modal.modal-open`). Do not narrow this back to a single selector.
- Dedup key: sel|index|text|tid|href — MUST include the census index (and
  href when present) or repeated per-row controls (Edit/Delete in a table)
  collapse onto one probe and every row after the first is skipped.
- Destructive guard tests text + title + aria-label (icon-only buttons rely
  on aria-label having no visible text/title at all).
- Destructive guard; void-not-delete; downloads/popups via waitForEvent.
- coverage.md lists every failure with route+selector+text.
- Runbook: node --check → --selftest → 20-click headless smoke → headed
  recording (--normal) with `2>&1 | tee plan/replay/run.log`.
- Failure: stop on first unrecoverable locator error naming route/selector;
  rollback snapshot-first; exitCode 1; budget hit → partial report, exit 0.
