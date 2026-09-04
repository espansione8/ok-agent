---
name: svelte-replay
description: >
  Self-contained, zero-dependency generator of recorded, cursor-visible Playwright
  replay scripts for ANY SvelteKit app. Scans the whole codebase (routes, server
  actions, endpoints, navbar, login form, DB file) to build a manifest from scratch,
  then emits ONE Node ESM script that exhaustively sweeps every route, button, link,
  tab, dropdown, modal, select, checkbox and expandable row — recursing into every
  child element revealed, modal-scoped so an open dialog never lets the sweep click
  a page button hiding behind it — with a gliding in-page cursor overlay, a
  Windows-safe DB snapshot/restore safety net (dev server stopped before restore,
  restarted after), heartbeat liveness logging, and a coverage report. Use when asked
  to "replay the app", "test every button/clickable", "full UI coverage sweep", or
  "build a demo recording from scratch". All outputs live under plan/replay/.
---

svelte-replay — full-app recorded replay + exhaustive UI sweep (v2.8.3, self-contained)

===============================================================================
CHANGELOG (v2.8.2 → v2.8.3 — stale-tag recovery for non-navigating re-renders)
===============================================================================
- FIXED (found live on saftbg, full run): 8 click-failed records were all
  the same shape — "Filter" buttons whose data-replay-cid tag was orphaned
  by a NON-navigating re-render (filter panel redrawing its list). The
  v2.7.1 navigated-signal handles navigation, but not this: the tag was
  gone while the element was still visually present, so both the original
  click AND the retry burned the full 3s scrollIntoView timeout waiting for
  a locator whose tag no longer existed, then recorded click-failed.
  probe() now runs resolveFresh() before clicking (and before the retry):
  it verifies the tag still resolves, and if not, re-finds the element by
  its semantic identity (sel + text + tid/title/aria/href) in the current
  DOM and re-tags it with a fresh 'S'-prefixed id (can never collide with
  census-issued numeric ids, and it never steals another element's tag).
  A genuinely-removed element is recorded as 'click-failed: element gone
  after re-render' immediately — no timeout burn. Live effect on saftbg:
  the 8 failed records become real clicks.

===============================================================================
CHANGELOG (v2.8.1 → v2.8.2 — port preflight: a stale detached server invalidates the backup bracket)
===============================================================================
- FIXED (found live, third saftbg run): a DETACHED dev server left running
  by a previous replay survives the next run's taskkill /T cleanup (it left
  the old process tree) and silently occupies BASE_URL's port. The new
  run's readiness check then passes against the STALE server while its own
  child fights for the port — worst of all, the "quiesced" backup runs
  with a server still holding the DB, quietly voiding the §7 bracket.
  startDevServer() now PREFLIGHTS the port before spawning: if BASE_URL
  already answers, it aborts with exit code 1 and a how-to-fix message
  (stop the stale server, or declare it external with
  --no-manage-dev-server). The script must own the port or own nothing —
  never guess whose server it is talking to.

===============================================================================
CHANGELOG (v2.8 → v2.8.1 — three bugs found by the SECOND live run, on saftbg)
===============================================================================
- FIXED (found live): probe()'s `navigated` branch returned WITHOUT pushing
  its record. On a link-heavy app (most clicks navigate!) nearly every
  record was silently dropped — the smoke run really clicked 20/20 but
  coverage.json reported {routes:0, elements:0, clicked:0}. rec is now
  pushed before the return; the state-unclean path already pushed (and the
  normal path pushes at the end), so no double-count.
- FIXED (found live): the script never EXITED after main() finished —
  spawn(…, { detached: true }) keeps the ChildProcess handle in the
  parent's ref count. The final startDevServer() (the one that leaves the
  server running for the user) pinned the event loop: coverage was written,
  the DB restored, the server restarted — and the process printed
  heartbeats forever. devServerProc.unref() releases the handle; the
  detached server outlives the script as intended.
- FIXED (found live): resolveParam gave up on ALL 35 dynamic routes because
  each route's own param-less prefix (e.g. /accounts for /accounts/:id)
  doesn't exist in this app — the links live on an entity hub (/companies
  links to /dashboard/:company_id, /accounts/:company_id, …). New
  HUB_ROUTES (§4.1, default '/companies,/home', override via
  --hub-routes a,b): when the prefix scan yields nothing, resolveParam
  retries the same href-shape scan on each hub before returning null. A hub
  hit fills ALL remaining :params at once (a /documents/7/view/3 link
  matches a multi-param shape in one step).

===============================================================================
CHANGELOG (v2.7.1 → v2.8 — second audit pass: backup bracketing, dropdown
scoping, per-selector census cap, cross-pass id uniqueness, modal escape)
===============================================================================
- FIXED (safety): backupDatabase() copied the LIVE .db/-wal/-shm files while
  the dev server was still running — the exact unsynchronized multi-file copy
  §4.6 warns about for restore. A write landing mid-copy yields a torn
  snapshot, and restore would then faithfully "restore" a corrupt DB. §7 now
  brackets the backup with stopDevServer()/startDevServer() exactly like
  every restore call site (§8 wording updated to match).
- FIXED: probe()'s modal-close fallback only tried a button labeled EXACTLY
  "Cancel" then Escape. A control named Close/Dismiss/No/× never matched,
  and the legacy checkbox/anchor-hack modal (.modal-open, no <dialog>) has
  no Escape handling at all — the modal stayed open, census() kept scoping
  to it, and the rest of the page was silently invisible to the sweep for
  the remainder of the route. New closeModal() helper layers: close-worded
  button (scoped INSIDE the modal) → Escape → re-click the element that
  OPENED the modal (the toggle for checkbox-hack modals); if the modal is
  STILL open after all that, probe() hard-reloads the route (dialog state is
  client-side, reload clears it) and aborts the census batch with a
  '(modal-stuck-reload)' record instead of trapping the sweep. It
  deliberately does NOT auto-click OK/Yes — "confirming" a dialog whose
  action may be destructive is exactly what the DESTRUCTIVE guard exists to
  prevent; only unambiguous dismiss words are clicked.
- FIXED: sweepRoute()'s dropdown loop called census(page) with NO scoping.
  census() scopes only to a modal; a hover-opened dropdown isn't one, so the
  loop censused and probed every visible clickable on the whole page
  mid-hover — clicking an ordinary page control navigates away or moves the
  mouse off the dropdown, closing it before its own children were tested
  (the same background-click bug already fixed for modals, unaddressed for
  dropdowns). census(page, rootSel) now takes an optional root selector; the
  dropdown loop passes DROPDOWN_SEL ('.dropdown-content, [role="menu"],
  [role="listbox"]') and probes children ONLY when the census actually
  resolved to a dropdown scope (every record now carries a scope field;
  the dedup key uses it). If no dropdown opened, the loop skips probing —
  the main sweep loop right below covers page-level elements anyway. The
  loop also now emits the 'dropdown-opened' record writeCoverage() already
  classified — that result existed only in the stats, never produced
  (stats/sweep drift).
- FIXED: the 80-element census cap was applied to the COMBINED list
  (out.slice(0, 80)) despite §3 saying "per selector". On a page with >80
  plain buttons/links, every later CLICKABLE selector — tbody tr, [role=tab],
  dropdown items — got ZERO elements, not a reduced count. The cap is now
  genuinely per selector (still applied after visibility filtering).
- FIXED: CID_SEQ was dead code — declared at module scope as "monotonically
  increasing census id" while the real counter lived INSIDE the
  page.evaluate() callback, resetting to 0 every pass and unable to even see
  the module variable. dedupKey() relies on el.cid for uniqueness, so two
  structurally identical elements from two different passes (e.g. the first
  button of two different modals, both "Cancel") collapsed onto one dedup
  key and the second was silently skipped as already-visited. census() now
  seeds its counter with CID_SEQ (passed as an evaluate argument) and
  advances it by the number of ids issued — unique across ALL passes. The
  dedup key's modal marker also died with v2.6's cid rewrite (el.cid != null
  was true on EVERY record → always 'y', carrying no information); it now
  uses the census record's real scope field (modal/dropdown/page).
- FIXED: hand-built accordions (a div toggled by component state — the
  common Svelte pattern) matched NO reveal branch (only modal / row-panel /
  a details[open]-count increase were detected); their children were found
  only by accident by the outer re-census, with depth reset to 0 and no
  collapse step. fingerprint() now also counts [aria-expanded="true"] and
  both open-state VECTORS (details + aria-expanded), and probe()'s reveal
  branch fires on a count increase OR an equal-count vector change;
  children recurse at depth+1 and the toggle is re-clicked to collapse.
- FIXED: exclusive <details name="group"> panels dodged `fp2.open > fp.open`
  entirely — opening one closes its sibling, so the total open-count stays
  EQUAL and the newly-revealed subtree was never swept. The open-state
  vector (…110… → …101…) catches the swap.

===============================================================================
CHANGELOG (v2.7 → v2.7.1 — two bugs found by the first REAL end-to-end run)
===============================================================================
- FIXED (found live on saftbg, SvelteKit): STALE CENSUS AFTER NAVIGATION.
  probe()'s navigated branch goes back to the origin route, but a SvelteKit
  client-side re-render REPLACES the DOM nodes census() had tagged — every
  data-replay-cid attribute vanishes while the caller's batch still holds
  locators for them. Each remaining element in the batch then burned its
  3s scrollIntoView timeout and recorded click-failed (reproduced: one
  navigation, then 18/20 smoke clicks failed with "waiting for locator
  [data-replay-cid=…]"). probe() now returns 'navigated' after a route
  change; probe recursion points (modal/row/details/rows children), the
  dropdown loop and sweepRoute()'s batch loop all check it and abandon the
  stale batch — the next census() re-tags fresh nodes and visited-dedup
  prevents re-probing what was already swept.
- FIXED (found live on saftbg): SCRIPT NEVER EXITED AFTER COMPLETING.
  startDevServer() spawned the dev server with default stdio pipes and
  .on('data') readers; after main() finished, those pipes kept the parent's
  event loop alive, so the 10s heartbeat printed forever after "coverage
  written". The server must outlive the script anyway (§7 leaves it running
  for the user), so it is now spawned detached with its output redirected
  to plan/replay/dev-server.log (file fds are not active handles and do
  not pin the loop — vite output is preserved in the log instead of the
  console relay).

===============================================================================
CHANGELOG (v2.6 → v2.7 — LOW-severity hardening: CSP-safe cursor, nav discovery)
===============================================================================
- FIXED (LOW, CSP): CURSOR_JS injected the overlay's styling via a <style>
  element and inline style attributes — under a strict CSP (no style-src
  'unsafe-inline') both are stripped, and the cursor overlay silently vanished
  from recordings (the sweep still ran — the demo just had no cursor). Static
  overlay styling now goes into a constructed CSSStyleSheet
  (document.adoptedStyleSheets), which CSP's inline-style rules do not block,
  with a <style>-element fallback for older engines; per-move left/top updates
  already used CSSOM property assignment (never CSP-blocked), and the SVG's
  inline animation attribute moved into the sheet for the same reason.
- FIXED (LOW): dropdown hover targeting used page.locator('header') only — an
  app that renders the navbar as a bare <nav> (no <header> wrapper) never had
  its dropdowns opened, so every NAV_TREE child was silently unswept. Both
  hover sites (nav() §4.4 and sweepRoute() §5) now target 'header, nav'.
- FIXED (LOW): navbar parent hover matched the manifest label with
  { exact: true }. Rendered navbar labels routinely differ from the scanned
  manifest label by padding whitespace or a trailing count badge
  ('Invoices 3'), and every such parent was silently never hovered — its
  dropdown children were never swept. Matching is now an anchored regex
  tolerant of surrounding whitespace and one trailing numeric badge
  (navLabelRe, §4.4) — still anchored at both ends, so 'In' cannot match
  'Invoices'; the failure mode is now 'never mismatches', not 'silently
  skips the subtree'.
- REPO: the skill now ships with its own regression harness (package.json +
  node --test) that extracts the §4–§6 embedded code verbatim from SKILL.md
  at test time and runs behavioral assertions against it (mock page + DOM).
  Any edit that changes embedded-code behavior without keeping the tests
  green fails `npm test` — the drift this changelog has been documenting by
  hand for six versions is now mechanized.

===============================================================================
CHANGELOG (v2.5 → v2.6 — audit-driven pass: locator safety, DB restore guard, CLI validation)
===============================================================================
- FIXED (CRITICAL, found by a bug-audit with executable tests): v2.5's modal
  scoping fixed only HALF the pipeline. census() correctly returned only the
  modal's children — but then mapped each to a GLOBAL locator
  `page.locator(sel).nth(i)`. Behind an open modal the global index counts
  page-level elements too, so the probe clicked a button sitting UNDER the
  dialog (verified: census said "Cancel", global locator resolved to a page
  "Save" button). census() now stamps every matched element with a unique
  temporary `data-replay-cid="N"` attribute inside the same evaluate, and the
  locator is `page.locator('[data-replay-cid="N"]')` — the attribute only
  ever exists on the element census actually selected, so modal/page scope is
  respected by construction. Tags are wiped on the next census.
- FIXED (CRITICAL, data loss): `restoreDatabaseBackup()` verified nothing. If
  the main DB backup was missing but a `-wal`/`-shm` backup existed (e.g. a
  crash mid-backup), it copied the stale WAL over the live one AND deleted the
  live main DB file (`else if existsSync(f) rmSync(f)`), returning `true`.
  Reproduced live: app.db deleted, WAL swapped, success message printed.
  Restore now VERIFIES the main DB backup exists before touching ANY live
  file; if it's missing it prints a loud error and returns false, leaving the
  live DB untouched.
- FIXED: backup stamp `.slice(0, 12)` = minute precision — two runs in the
  same minute silently overwrote each other's backups. Stamp now has seconds
  precision plus a random suffix (YYYYMMDDHHmmss-xxxx).
- FIXED: `restoreDatabaseBackup()` copies the MAIN db first; only after that
  succeeds does it copy/refresh `-wal`/`-shm`, so an interrupted restore can
  no longer leave a WAL without its DB.
- FIXED: `--selftest` asserted `census.toString()` contains `'modal ||
  document'` — a source-substring check that passed while the locator bug
  above shipped. Selftest now asserts census contains `data-replay-cid` (the
  actual mechanism), `restoreDatabaseBackup` contains its verification, and
  `wirePageGuards` exists.
- FIXED: `sweepRoute()`'s new-elements loop exited when `newCount >=
  beforeCount` — a click that reveals one element per click (lazy rows,
  load-more) hit equality on iteration 1 and the rest were never probed.
  Loop now continues while ANY unvisited elements remain, bounded by the
  existing guard counter.
- FIXED: dropdown children were censused once AFTER hovering all NAV_TREE
  parents sequentially — only the last dropdown was still open. Each parent
  is now hovered and censused inside the same iteration, while ITS dropdown
  is open.
- FIXED: `<details>` expansion — the `fp2.open > fp.open` branch pressed
  Escape and moved on, never sweeping the revealed children. New branch
  recurses census into the opened accordion, then re-clicks the summary to
  close it.
- FIXED: `--deep-selects` enumeration used `selectOption(i)` with a NUMERIC
  index — Playwright treats that as an option VALUE, so any select whose
  values aren't `"1","2",...` threw (30s default timeout each, behind a
  catch). Enumeration now reads real option values/labels via evaluate.
- FIXED (safety): option labels/values bypassed the DESTRUCTIVE guard — a
  select whose text is innocuous could enumerate a "Void all invoices"
  option (reproduced live). Each option's label+value is now guard-checked
  before selection.
- FIXED: row collapse clicked `el.loc.locator('button').first()` — an
  arbitrary nested button (Edit/Delete/Approve), not a toggle. It now
  re-clicks the ROW (exactly how it was expanded), falling back to Escape.
- FIXED: `page.goBack()` failure left the sweep stranded on the navigated-to
  page with no fallback. Now verifies it landed back on the original route
  and hard-gotos `BASE_URL + fp.url` if not.
- FIXED: census applied the 80-element cap BEFORE visibility filtering — 90
  hidden + 5 visible buttons censused as "80 hidden, 0 visible" (reproduced).
  Cap now applies to the visible set.
- FIXED: census didn't filter `aria-disabled="true"` / `pointer-events:none`
  elements, and `javascript:` hrefs were censused and "clicked".
- FIXED: EXCLUDES matched against `JSON.stringify(d)` — `--exclude button`
  excluded EVERY button because the sel field contains the word. Matching is
  now against the semantic fields (text/tid/title/aria/href) only.
- FIXED: DESTRUCTIVE regex matched substrings ("A**void** double charge" was
  skipped). Now word-boundary anchored per term.
- FIXED: native `alert()`/`confirm()`/`prompt()` dialogs could stall the run
  (no handler); popups (`target="_blank"`, window.open) escaped the sweep
  context. New `wirePageGuards()` registers dialog+popup handlers; §7 wires
  it after page creation.
- FIXED: caught Playwright actions without explicit timeouts (modal Cancel in
  probe's recursion-close, collapse row re-click, select restore, goBack) —
  all now carry `{ timeout: 1500 }` per the v2.4 rule.
- FIXED: `startDevServer()` readiness accepted ANY response incl. HTTP 500
  (`if (r)`); now requires `r.status < 500`. `stopDevServer()` slept a blind
  800ms; now waits for the child's real `exit` event with a 5s deadline.
- FIXED: CLI — `--param`/`--exclude` as the LAST argument pushed `undefined`
  and `.split()` threw; a value flag passed without a value returned boolean
  `true`; `--until abc` → NaN → zero parts; invalid `--mode` silently did
  nothing. `val()` now returns the default when the next token is missing or
  itself a flag; `list()` skips missing values; numeric flags go through a
  NaN-safe parse; MODE is validated against sweep|scripted|both.
- FIXED: coverage `clicked` stat only counted literal `clicked` + select —
  modal-opened/row-expanded/rows-revealed/dropdown-opened/navigated are real
  clicks and are now counted; per-result breakdown added.
- FIXED: §8 promised "retry-once after settle on click failure" but probe()
  had no retry. probe() now retries the click once after P.settle.
- FIXED: SIGINT handler had no try/catch — a stopDevServer() throw would
  skip restore AND skip exit. Wrapped in try/catch/finally, exit(130) in
  finally.
- FIXED: §7's own UNTIL derivation `parseInt(UNTIL_ARG, 10)` NaNs on
  `--until abc` (same class of bug it fixed); now falls back to PARTS.length.
- ADDED: §6.1 implements `resolveParam` as real embedded code (was prose
  only, but required by --selftest — a generated script that forgot to
  invent it failed selftest with no reference implementation to copy).
- ADDED: Node >= 18 requirement documented (global fetch); §3 documents the
  deliberate safety caps (80/selector, depth 6, 60 routes, MAX_CLICKS).

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
CHANGELOG (v2.4 → v2.5 — modal-scoped census + Windows-safe DB restore)
===============================================================================
- FIXED: `census()` always queried `document.querySelectorAll(sel)` regardless
  of whether a modal was open. Nothing in this codebase marks the rest of the
  page `inert` while a `<dialog>` is open, so the sweep could still see,
  census, and click page-level buttons sitting behind/underneath an open
  modal — testing the wrong layer while a dialog is supposed to have
  exclusive focus. `census()` now detects `dialog[open], .modal-open` first;
  if one exists, every selector in CLICKABLE is queried with that modal
  element as the root instead of `document`, so while a modal is open ONLY
  elements inside it are census'd and probed. Once the modal closes, root
  reverts to `document` and page-level elements are swept again as before.
  One-line scoping change (`const root = modal || document;`), but it's the
  mechanism that guarantees "modal open → only modal buttons tested; modal
  closed → only page buttons tested," never a mix of both in the same pass.
- CLARIFIED (no behavior change, re-verified against the fix above): the
  recursive `census(page)` calls already present in `probe()` — one on
  `modal-opened`, one on `row-expanded` — inherit this scoping for free,
  since both call the same `census()`. A modal's children are swept through
  the modal-scoped branch; an accordion/row's newly-revealed children (no
  modal involved) are swept through the normal document-wide branch, so
  every button/link/tab revealed by expanding a row is still covered exactly
  as before — only the modal case changed.
- ADDED: dev-server lifecycle management (`startDevServer`/`stopDevServer`,
  §4.7) to fix Windows DB corruption on restore. Root cause:
  `restoreDatabaseBackup()` copies snapshot files back over the live
  `DB_PATH`/`-wal`/`-shm` files while the SvelteKit dev server (and whatever
  libSQL/better-sqlite3 handle it holds open) is still running. On Windows a
  running process can hold a lock/mmap on the `-shm` file; overwriting the
  `.db`/`-wal` files underneath it desyncs the shared-memory index from the
  file that replaced it, corrupting the DB on the process's next write —
  copying over an open file is far more likely to corrupt state on Windows
  than on Linux/macOS, where the old inode just stays open until released.
  Fix: every restore call site now does
  `stopDevServer() → restoreDatabaseBackup(stamp) → startDevServer()` — the
  server (and its file handles) is fully torn down BEFORE the snapshot copy
  runs, and only brought back up AFTER the copy completes, so the DB files
  are never touched while something has them open.
- New flags `--dev-cmd`, `--dev-cwd`, `--dev-ready-path`, `--dev-ready-timeout`
  control the dev server the script now owns. New flag
  `--no-manage-dev-server` opts back out (assume something else — a separate
  terminal, a CI service container — owns the server's lifecycle; restore
  falls back to printing a manual "restart it now" instruction, matching
  v2.4 behavior) for setups where the script spawning its own `npm run dev`
  isn't appropriate.
- --selftest (§7) now also asserts `startDevServer`/`stopDevServer` exist as
  functions, and asserts `census.toString()` contains `'modal || document'`
  — same rigor as the existing `glide(` check — so a generated script that
  only describes the modal-scoping fix in a comment fails --selftest instead
  of silently shipping without it.

===============================================================================
0. ZERO-DEPENDENCY PRINCIPLE
===============================================================================
Works with NO pre-existing replay/demo/test file. Never read, import or require
any *.mjs from the target repo. All code the generated script needs is embedded
INLINE in §4-§6 of this document — copy it verbatim into the emitted script.
All outputs under plan/replay/ (script, db-backups/, shots/, coverage.*,
manifest.json, run.log). User adds one .gitignore line: plan/replay/.
Runtime requirement: Node >= 18 (the embedded code uses global fetch for the
dev-server readiness probe and native ESM).

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
A5 NAVBAR: header OR bare <nav> component (both are scanned, v2.7) →
   NAV_TREE = { '': [top-level links],
   'Parent': [{label, href}...] }. Drives hover-open + seeds the route queue.
A6 DB: grep for sqlite path (dev.db|*.sqlite|DB_PATH|better-sqlite3) → dbGuess.
   Also detect reset route (reset|restore-baseline) → resetHint.
A7 Per-route <select>/dialog/details density (advisory for the report).

===============================================================================
2. PHASE B — EMIT plan/replay/replay-all.mjs
===============================================================================
One Node ESM file. Imports ONLY: playwright, node:fs, node:child_process, node:path.
Order: (1) CLI parsing §3, (2) MANIFEST const, (3) backup/restore §4.6,
(4) dev-server lifecycle §4.7, (5) embedded blocks §4, (6) census/probe/sweep
§5, (7) param resolution §6, (8) PARTS array (empty by default) —
immediately followed by the UNTIL derivation (see §3), (9) main() §7.

MANDATORY PRE-RUN GATES (tell the user to run all three):
  node --check plan/replay/replay-all.mjs          # syntax
  node plan/replay/replay-all.mjs --selftest       # wiring, no browser/app
  node plan/replay/replay-all.mjs --headless --mode sweep --max-clicks 20
                                                   # real-scenario smoke (fast is default)
Only after all three pass: headed recording run (--normal, no --headless).
NOTE: by default (§4.7) the script spawns its own dev server via --dev-cmd.
If the user already has one running on BASE_URL's port, tell them to either
stop it first or pass --no-manage-dev-server so the script assumes the
existing one instead of a second instance fighting over the same port.

===============================================================================
3. CLI (all flags must exist and be parsed)
===============================================================================
--base-url --user --pass --company --db-path --backup-dir --skip-backup
--reset-url --mode sweep|scripted|both (default both) --from N --until N
--max-clicks N (2000) --allow-destructive --exclude TEXT (repeatable)
--deep-selects --month YYYY-MM --shot-dir DIR --param name=value (repeatable)
--normal --headless --selftest
--dev-cmd CMD (default "npm run dev") --dev-cwd DIR (default ".")
--dev-ready-path PATH (default "/") --dev-ready-timeout N (default 30000)
--no-manage-dev-server (assume an externally-managed dev server; restore
  falls back to printing a manual restart instruction instead of spawning
  or killing anything — see §4.7)

CRITICAL: dev-server ownership is opt-out, not opt-in —
`MANAGE_DEV_SERVER = !has('no-manage-dev-server')` defaults to TRUE. This is
deliberate: the Windows -shm corruption this exists to prevent only happens
if something restores the DB while the server is up, and "the script owns
the server" is the only way to guarantee stop-before-restore actually runs
on every exit path (end of run, failure, SIGINT) without depending on the
user remembering a flag. `--no-manage-dev-server` is the escape hatch for
setups where the script must not spawn a process (e.g. it IS the dev
server's parent process already, or a CI container manages it) — those
setups still get correctness, just via the printed manual-restart prompt
from v2.4 instead of automatic management.

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
  const UNTIL = UNTIL_ARG != null ? (parseInt(UNTIL_ARG, 10) || PARTS.length) : PARTS.length;
and use `PARTS.slice(FROM, UNTIL)` everywhere (§7). Never reference
UNTIL_ARG directly outside this derivation. (The `|| PARTS.length` guards
both `null`/`undefined` AND `--until abc` → NaN, which plain parseInt
propagates into `slice(0, NaN)` = zero parts silently.)

SAFETY CAPS (deliberate, disclosed — the sweep is "exhaustive" within these):
- census() probes at most 80 VISIBLE elements per selector per pass
  (applied AFTER visibility filtering, so hidden elements never consume cap).
- probe() recursion depth limit 6 (modal → row → panel → … nested layers).
- warm-up + route queue caps at 60 routes per run.
- MAX_CLICKS default 2000 — the hard budget; when it's hit the run stops
  and writes a partial coverage report with exitCode 0.
Tune via flags (--max-clicks) or by editing CLICKABLE/limits in the emitted
script; never remove them silently in a generator revision.

===============================================================================
4. EMBEDDED BLOCKS (copy verbatim)
===============================================================================
// §4.1 — imports + CLI
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, rmSync, openSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
// val() guards the trailing-flag case: `--mode` as the last argv token (or
// followed by another flag) used to return boolean true, silently defeating
// the default. Next token must exist AND not look like a flag.
const val = (n, d) => {
  const i = args.indexOf('--' + n);
  if (i === -1) return d;
  const v = args[i + 1];
  return v == null || v.startsWith('--') ? d : v;
};
// list() skips the trailing-flag case instead of pushing undefined —
// `--param` as the last token used to poison PARAM_OVERRIDES and throw.
const list = (n) => { const o = []; for (let i = 0; i < args.length; i++) if (args[i] === '--' + n && args[i + 1] != null && !args[i + 1].startsWith('--')) o.push(args[i + 1]); return o; };
const parseIntSafe = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
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
if (!['sweep', 'scripted', 'both'].includes(MODE)) { console.error(`✗ invalid --mode "${MODE}" (expected sweep | scripted | both)`); process.exitCode = 2; process.exit(2); }
const FROM = Math.max(0, parseIntSafe(val('from', '0'), 0));
const UNTIL_ARG = val('until', null);   // resolve to UNTIL only after PARTS exists — see §3/§7
const MAX_CLICKS = Math.max(1, parseIntSafe(val('max-clicks', '2000'), 2000));
const ALLOW_DESTRUCTIVE = has('allow-destructive');
const EXCLUDES = list('exclude');
const DEEP_SELECTS = has('deep-selects');
const MONTH = val('month', new Date().toISOString().slice(0, 7));
const SHOT_DIR = val('shot-dir', null);
const PARAM_OVERRIDES = Object.fromEntries(list('param').map((s) => { const [k, ...v] = s.split('='); return [k, v.join('=')]; }));
// v2.8.1 HUB_ROUTES: entity-hub pages whose links resolve dynamic params
// (§6.1 hub fallback). Extend per app in Phase A (§1 A5/A7) — e.g. saftbg:
// ['/companies', '/home'].
const HUB_ROUTES = val('hub-routes', '/companies,/home').split(',').map((s) => s.trim()).filter(Boolean);
const MANAGE_DEV_SERVER = !has('no-manage-dev-server');   // default: script owns the dev server's lifecycle (see §4.7)
const DEV_CMD = val('dev-cmd', 'npm run dev');
const DEV_CWD = val('dev-cwd', '.');
const DEV_READY_PATH = val('dev-ready-path', '/');
const DEV_READY_TIMEOUT = Math.max(1000, parseIntSafe(val('dev-ready-timeout', '30000'), 30000));
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

// §4.2 — CURSOR_JS v2 (centered start + idle pulse; OBS-capturable)
const CURSOR_JS = `
(() => {
  if (window.__replayCursorEl) return;
  // v2.7 CSP-SAFE styling: a strict style-src policy (no 'unsafe-inline')
  // strips BOTH a <style> element's textContent and style="" attributes, so
  // the old injection silently lost the overlay under hardened CSPs. Static
  // rules go into a constructed CSSStyleSheet (adoptedStyleSheets is not an
  // inline style and is not blocked by style-src); fallback to a <style>
  // element for engines without Constructable Stylesheets. The per-move
  // left/top updates and the pulse animation are also in the sheet — CSSOM
  // property assignment (el.style.left = ...) is never CSP-blocked.
  const RC_CSS =
    '#replay-cursor{position:fixed;left:50%;top:50%;width:24px;height:24px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 1px 2px rgba(0,0,0,.65));}' +
    '#replay-cursor svg{animation:rc-pulse 1.2s infinite;}' +
    '@keyframes rc-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }';
  let sheet = null;
  const injectStyle = () => {
    if (sheet || document.getElementById('replay-cursor-style')) { sheet = true; return; }
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(RC_CSS);
      (document ?? window.document).adoptedStyleSheets = [...(document.adoptedStyleSheets ?? []), sheet];
    } catch {
      const st = document.createElement('style');
      st.id = 'replay-cursor-style';
      st.textContent = RC_CSS;
      (document.head ?? document.documentElement)?.appendChild(st);
    }
  };
  const build = () => {
    if (window.__replayCursorEl) return window.__replayCursorEl;
    injectStyle();
    const el = document.createElement('div');
    el.id = 'replay-cursor';
    el.style.left = '50%'; el.style.top = '50%';   // position start; per-move updates below
    el.style.width = '24px'; el.style.height = '24px'; el.style.pointerEvents = 'none';
    el.style.zIndex = '2147483647'; el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.65))';
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
  // Defensive re-attach: SvelteKit client-side transitions shouldn't touch
  // document.body, but if a full re-render ever detaches the overlay, the
  // next mousemove's ensure() call above rebuilds it — no extra wiring
  // needed as long as callers keep driving real mouse movement via glide().
})();
`;

// §4.3 — interaction helpers (FAST only tightens P's timings — never bypasses glide)
// GLIDE GUARANTEE: every helper below calls glide() before acting, unconditionally.
// No helper has a FAST-mode early return that swaps in a raw locator.click()/
// selectOption()/page.goto() — FAST's only effect is shorter P.moveStep/settle/
// typeDelay/post/between (§4.1), so the in-page cursor still visibly glides to
// and interacts with every element, just quickly instead of at recording pace.
// --selftest (§7) asserts this mechanically by checking each helper's source
// for the substring 'glide(' — do not refactor a helper to move the mouse any
// other way, and do not reintroduce a `if (FAST) { ...; return; }` bypass, or
// the in-page cursor overlay will silently stop tracking real interactions.
const center = async (locator) => {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 });
  const box = await locator.boundingBox({ timeout: 1500 });
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
  await closeModal(page);
};
// v2.8 CLOSE-MODAL LADDER — closes the open modal (dialog[open], .modal-open)
// and returns 'closed' | 'stuck'. Layered because no single close works for
// every modal flavor this skill supports: (1) a dismiss-worded button scoped
// INSIDE the modal — Close/Dismiss/No/× too, not just exact "Cancel";
// (2) Escape — native <dialog> only; (3) re-clicking the element that OPENED
// the modal — the toggle for the legacy checkbox/anchor-hack .modal-open,
// which has neither a native close nor Escape handling. Never clicks
// OK/Yes/Confirm: "confirming" an unknown dialog may execute a destructive
// action — the DESTRUCTIVE guard's job, not a sweep-close shortcut.
const closeModal = async (page, opener) => {
  for (let t = 0; t < 2; t++) {
    await page.locator('dialog[open], .modal-open')
      .getByRole('button', { name: /^(cancel|close|dismiss|no|×|✕)\s*$/i }).first()
      .click({ timeout: 1500 }).catch(() => {});
    if (!(await page.locator('dialog[open], .modal-open').count())) return 'closed';
    await page.keyboard.press('Escape').catch(() => {});
    if (!(await page.locator('dialog[open], .modal-open').count())) return 'closed';
    if (opener) await opener.click({ timeout: 1500 }).catch(() => {});
    if (!(await page.locator('dialog[open], .modal-open').count())) return 'closed';
    await sleep(200);
  }
  return 'stuck';
};
// Native dialogs and popups are registered ONCE per page (§7 main()), right
// after page creation — before login, sweep, or anything else. Without these:
// an unhandled alert()/confirm() stalls the run until Playwright's no-dialog
// default kills it, and a target="_blank"/window.open popup silently escapes
// the sweep context (the run keeps "succeeding" on the wrong page).
// v2.7.1 TEARDOWN WATCHDOG (found live on saftbg): browser.close() never
// resolved after a sweep that opened/closed dialogs and popups — the driver
// pipe wedged and the script hung INSIDE close() forever (heartbeats kept
// printing; the 10s interval is .unref()'d, so a printing heartbeat proves
// the loop is alive and some await never settled). close() is raced against
// a watchdog: on stall, kill ONLY Playwright-managed browser processes
// (matched by the ms-playwright cache in their executable path — never the
// user's own Chrome) and hard-exit with the pending exit code. Safe by
// construction: coverage, DB restore and the server restart have ALREADY
// happened by the time this runs, and the dev server is detached.
const teardown = async (browser) => {
  if (!browser) return;
  const stalled = await Promise.race([browser.close().then(() => false), sleep(8000).then(() => true)]);
  if (stalled) {
    console.log('      ⚠ teardown: browser.close() did not settle in 8000ms — killing orphaned Playwright browsers, forcing exit');
    try { execSync('powershell -NoProfile -Command "Get-Process chrome,headless_shell -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*ms-playwright*\' } | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
    try { execSync("pkill -f 'ms-playwright' 2>/dev/null", { stdio: 'ignore' }); } catch {}
    process.exit(process.exitCode || 0);
  }
};
const wirePageGuards = (page) => {
  page.on('dialog', (d) => { console.log(`      ⚠ native dialog (${d.type()}): "${String(d.message()).slice(0, 120)}" — auto-dismiss`); d.dismiss().catch(() => {}); });
  page.on('popup', async (p) => { console.log('      ⚠ popup opened — closing it to keep the sweep in context'); await p.close().catch(() => {}); });
};

// §4.4 — nav (NAV_TREE generated from scan; signature (page,name,urlRe))
// v2.7 navbar hover targeting: (1) 'header, nav' — a bare <nav> navbar with
// no <header> wrapper is common; (2) label matching via an anchored regex —
// rendered labels routinely carry padding whitespace or a trailing count
// badge ('Invoices 3'), and exact-text matching silently skipped every such
// parent's dropdown subtree. Anchored at both ends, so 'In' can never match
// 'Invoices'; a label that renders DIFFERENTLY (icon glyphs, i18n) still
// won't hover — the failure mode is 'never mismatches', not 'silently skips'.
const navLabelRe = (label) =>
  new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?:\\d+)?\\s*$');
const navHoverLoc = (page, label) =>
  page.locator('header, nav').getByText(navLabelRe(label)).first();
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
      await navHoverLoc(page, parent).hover({ timeout: 1500 }).catch(() => {});
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

// §4.5 — reset fallback (only when no snapshot)
async function resetViaForm(page) {
  if (!RESET_URL) { console.log('      ⚠ no snapshot + no --reset-url — restore manually from ' + BACKUP_DIR); return; }
  log('RESET', 'roll back via ' + RESET_URL);
  await page.goto(BASE_URL + RESET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const submit = page.locator('form button[type="submit"], form button').first();
  await submit.click({ timeout: 3000 }).catch(() => {});
  await sleep(3000);
}

// §4.6 — DB snapshot/restore (v2.6: verify-before-restore, seconds-precision stamp)
function backupDatabase() {
  if (SKIP_BACKUP) { console.log('⚠ --skip-backup: no DB snapshot'); return null; }
  // v2.8: in --no-manage-dev-server mode the script CANNOT stop the
  // externally-owned server, so it cannot take a safe snapshot (the copy
  // would run on a live DB — the tear risk this section exists to prevent)
  // nor a safe restore. Skip both with an explicit warning instead of doing
  // the unsafe thing silently.
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: script cannot quiesce the DB (server externally owned) — backup/restore skipped; DB is NOT rolled back'); return null; }
  if (!DB_PATH || !existsSync(DB_PATH)) { console.log(`⚠ --db-path file missing (${DB_PATH}) — rollback relies on reset form`); return null; }
  mkdirSync(BACKUP_DIR, { recursive: true });
  // v2.6: seconds precision + random suffix. The old minute-precision stamp
  // (slice(0,12)) meant two runs in the same minute silently overwrote each
  // other's snapshots — the earlier backup was lost exactly when you needed
  // history. Random suffix also disambiguates two runs started the same second.
  const rand = Math.random().toString(36).slice(2, 6);
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14) + '-' + rand;
  const files = [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm'].filter(existsSync);
  for (const f of files) copyFileSync(f, path.join(BACKUP_DIR, stamp + '.' + path.basename(f)));
  // Verify the snapshot is actually usable before claiming success — a stamp
  // whose MAIN db copy is missing must never be returned, or restore() would
  // later refuse to run (or worse, the caller would fall through to resetViaForm).
  if (!existsSync(path.join(BACKUP_DIR, stamp + '.' + path.basename(DB_PATH)))) {
    console.error(`✗ backup verification failed: main DB copy missing at ${BACKUP_DIR}/${stamp}.*`);
    return null;
  }
  console.log(`✓ DB snapshot → ${BACKUP_DIR}/${stamp}.* (${files.length} file(s))`);
  return stamp;
}
function restoreDatabaseBackup(stamp) {
  if (!stamp || !DB_PATH) return false;
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: restore skipped (server externally owned) — restart it, then restore manually from ' + BACKUP_DIR); return false; }
  // v2.6 VERIFY-FIRST: the single most important safety property of this
  // function. The old version looped over all three files and, for any file
  // whose backup was missing, DELETED the live file ("drop stale WAL/SHM").
  // If the main DB backup was missing but a WAL backup existed (crash during
  // backup, --skip-backup race, wrong --backup-dir), it copied a stale WAL
  // over the live one and DELETED the live main DB — then returned true.
  // Reproduced in testing: app.db deleted, WAL swapped, success printed.
  const mainBackup = path.join(BACKUP_DIR, stamp + '.' + path.basename(DB_PATH));
  if (!existsSync(mainBackup)) {
    console.error(`✗ REFUSING TO RESTORE: main DB backup missing at ${mainBackup} — live DB left untouched`);
    return false;
  }
  // Copy the MAIN db first; only after that succeeds touch -wal/-shm.
  // Order matters: an interrupted restore must never leave a fresh WAL
  // paired with an old DB (that pairing is exactly the -shm desync this
  // whole section exists to prevent).
  copyFileSync(mainBackup, DB_PATH);
  for (const suffix of ['-wal', '-shm']) {
    const f = DB_PATH + suffix;
    const b = path.join(BACKUP_DIR, stamp + '.' + path.basename(f));
    if (existsSync(b)) copyFileSync(b, f);
    else if (existsSync(f)) rmSync(f);          // safe NOW: main backup verified + main copied
  }
  console.log('✓ DB restored from snapshot (restart dev server if it held a stale WAL)');
  return true;
}

// §4.7 — dev server lifecycle (Windows -shm-safe restore — MUST bracket every restore call)
let devServerProc = null;
async function startDevServer() {
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: assuming the dev server is already up (or you will restart it yourself)'); return; }
  if (devServerProc) return;                          // already running under our management
  // v2.8.2 PORT PREFLIGHT (found live on saftbg): a DETACHED server from a
  // previous run survives the old script's taskkill /T (it left the process
  // tree) and silently occupies BASE_URL's port. Without this guard the new
  // run's readiness check passes against the STALE server while its own
  // child fights for the port — and the "quiesced" backup runs with a
  // server still holding the DB. The script must own the port or own
  // nothing; abort rather than guess.
  try {
    const probeRes = await fetch(BASE_URL + DEV_READY_PATH, { signal: AbortSignal.timeout(2500) });
    console.error(`✗ ABORT: ${BASE_URL} already answers (HTTP ${probeRes?.status}) before startDevServer — a server this script does not own is running.\n` +
      `  Stop it first (or pass --no-manage-dev-server to declare it external). ` +
      `Windows hint: netstat -ano | findstr :${new URL(BASE_URL).port}`);
    process.exit(1);
  } catch {}   // nothing listening — the expected case; proceed to spawn
  log('DEV-SERVER', `starting: ${DEV_CMD} (cwd ${DEV_CWD})`);
  // v2.7.1 PROCESS-EXIT FIX (found live on saftbg): with the default stdio
  // pipes plus .on('data') readers, the child's stdout/stderr keep the
  // parent's event loop alive after main() finishes — the script
  // "completed" but never exited, and its 10s heartbeat printed forever.
  // The server must OUTLIVE the script anyway (§7 leaves it running for the
  // user), so detach it and route its output to a FILE descriptor instead
  // of pipes: file fds are not active handles and do not pin the loop, so
  // run.log keeps the vite output without the hang.
  let devLogFd = 'ignore';
  try { devLogFd = openSync('plan/replay/dev-server.log', 'a'); } catch {}
  devServerProc = spawn(DEV_CMD, { cwd: DEV_CWD, shell: true, detached: true, stdio: ['ignore', devLogFd, devLogFd] });
  // v2.8.1 (found live on saftbg): detached:true does NOT remove the
  // ChildProcess handle from the parent's ref count — after main() finished
  // (coverage written, DB restored, server restarted) the node process
  // stayed alive forever printing heartbeats. The server must outlive the
  // script, so drop the parent-side handle ref explicitly.
  devServerProc.unref();
  // (no stdout/stderr .on('data') relays — output goes to the log file above)
  devServerProc.on('exit', (code) => { if (devServerProc) console.log(`      ⚠ dev server exited early (code ${code})`); devServerProc = null; });
  const deadline = Date.now() + DEV_READY_TIMEOUT;
  while (Date.now() < deadline) {
    // `if (r)` accepted ANY response including HTTP 500 — a crashed dev
    // server serving error pages counted as "ready". Require a sane status.
    try { const r = await fetch(BASE_URL + DEV_READY_PATH); if (r && r.status < 500) { console.log('      ✓ dev server ready'); return; } }
    catch {}
    await sleep(400);
  }
  throw new Error(`dev server did not become ready within ${DEV_READY_TIMEOUT}ms (${BASE_URL + DEV_READY_PATH})`);
}
async function stopDevServer() {
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: restart your dev server manually before continuing'); return; }
  if (!devServerProc) return;
  const proc = devServerProc;
  const pid = proc.pid;
  log('DEV-SERVER', `stopping pid ${pid}`);
  // Resolve on the child's REAL exit, not a guessed sleep. The old blind
  // sleep(800) raced Windows handle release: if npm/vite took >800ms to die,
  // restore() copied DB files while the server still held the -shm mmap —
  // exactly the corruption this section exists to prevent.
  const exited = new Promise((resolve) => {
    if (proc.exitCode != null || proc.signalCode != null) return resolve();
    proc.once('exit', resolve);
  });
  try {
    if (process.platform === 'win32') {
      // npm on Windows wraps the real node/vite process; a plain .kill() on
      // the npm.cmd pid often leaves the actual server — and its lock on
      // the DB's -shm file — running. /T kills the whole tree, /F forces it.
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');                  // negative pid = whole process group (spawned with detached:true above)
    }
  } catch (e) { console.log(`      ⚠ stopDevServer: ${e?.message ?? e}`); }
  devServerProc = null;
  const timeout = sleep(5000).then(() => 'timeout');
  const result = await Promise.race([exited.then(() => 'exited'), timeout]);
  if (result === 'timeout') console.log('      ⚠ dev server did not exit within 5s — DB file handles may still be held; restore may fail');
  await sleep(300);   // small settle AFTER real exit for OS handle bookkeeping
  console.log('      ✓ dev server stopped');
}
// INVARIANT: restoreDatabaseBackup() is NEVER called on its own from main()
// (§7) — every call site does stopDevServer() → restoreDatabaseBackup(stamp)
// → startDevServer(), in that order, so the DB files are only ever touched
// while nothing has them open, and the app is always left running
// afterward. resetViaForm() (§4.5) needs the server UP to navigate, so it
// only ever runs AFTER startDevServer() has resolved.

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
// v2.6: word-boundary anchored. The old substring regex skipped any control
// containing "avoid" (A|VOID) in its label — a false destructive skip.
const DESTRUCTIVE = /\b(void|delete|remove|drop|purge|reset|disable|log ?out|sign ?out)\b/i;
const visited = new Set(); const routeQueue = new Set();
// v2.8: monotonically increasing census id — census() seeds its in-page
// counter with this and advances it by the ids it issues, so ids stay unique
// ACROSS passes. (v2.6's counter lived inside the page.evaluate() callback:
// it reset to 0 on every pass and could not even see this module variable —
// two structurally identical elements from different passes collapsed onto
// one dedup key and the second was silently skipped.)
let CID_SEQ = 0;
// v2.8 DROPDOWN SCOPE: elements matching this are what a hover-opened
// dropdown's children live in — census(page, DROPDOWN_SEL) restricts the
// sweep to them so mid-dropdown probes can't click background page controls
// (the modal scoping bug, in its dropdown form).
const DROPDOWN_SEL = '.dropdown-content, [role="menu"], [role="listbox"]';
async function census(page, rootSel) {
  const t0 = Date.now();
  const raw = await page.evaluate(({ sels, rootSel, cidBase, capPer }) => {
    // SCOPING (v2.5 + v2.8): the effective census root is, in priority order,
    // (1) an open modal — while a dialog is up ONLY its children are swept,
    // never page buttons behind it; (2) an explicit rootSel (dropdown) —
    // used by sweepRoute()'s hover loop so a dropdown's census can't leak to
    // the whole page; (3) document.
    const modal = document.querySelector('dialog[open], .modal-open');
    const dropdown = rootSel ? document.querySelector(rootSel) : null;
    const scope = modal ? 'modal' : dropdown ? 'dropdown' : 'page';
    const root = modal || dropdown || document;
    if (rootSel && !dropdown) return { list: [], issued: 0 };   // asked for dropdown scope, none open — caller skips probing
    // v2.8: NO WIPE. Ids are globally unique now (CID_SEQ base + monotonic),
    // so re-tagging can never collide with a previous pass's tags — while a
    // wipe here STRIPS tags from elements an in-flight caller batch still
    // holds locators for (probe()'s recursive modal/row census did exactly
    // that: it invalidated the parent batch's remaining locators, burning a
    // 3s click-failed timeout per element). Old tags on replaced DOM nodes
    // are inert — no id ever gets reused.
    let cid = cidBase;   // seeded from module CID_SEQ — unique across passes
    // v2.8: NO WIPE. Ids are globally unique now (CID_SEQ base + monotonic),
    // so re-tagging can never collide with a previous pass's tags — while a
    // wipe here STRIPS tags from elements an in-flight caller batch still
    // holds locators for (probe()'s recursive modal/row census did exactly
    // that: it invalidated the parent batch's remaining locators, burning a
    // 3s click-failed timeout per element). Old tags on replaced DOM nodes
    // are inert — no id ever gets reused.
    const out = []; const seen = new Set();
    for (const sel of sels) {
      let i = 0;
      for (const n of root.querySelectorAll(sel)) {
        if (seen.has(n)) continue; seen.add(n); i++;
        const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (st.pointerEvents === 'none') continue;                 // overlay-dismissed / inert controls: clicking them hits whatever is on top
        if (n.getAttribute('aria-disabled') === 'true') continue;  // disabled via aria — broad selectors like [data-testid] would still match
        // sel/i kept on the record: dedupKey() and coverage rows need them.
        out.push({ el: n, sel, i, scope, tag: n.tagName.toLowerCase(),
          text: (n.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
          tid: n.getAttribute('data-testid'), title: n.getAttribute('title'),
          aria: n.getAttribute('aria-label'), href: n.getAttribute('href') });
      }
    }
    // v2.6 CAP AFTER VISIBILITY: the old `.slice(0, 80)` ran on the raw
    // match list BEFORE visibility filtering — 90 hidden buttons + 5 real
    // ones censused as "80 hidden, 0 visible" (reproduced). Filter first,
    // cap the visible survivors, and stamp each with a unique census id.
    // v2.8 PER-SELECTOR CAP: v2.6 still capped the COMBINED list, so on a
    // page with >80 plain buttons/links every later CLICKABLE selector —
    // tbody tr, [role=tab], dropdown items — got ZERO elements, exactly
    // what §3's "per selector" wording never allowed. Cap each selector's
    // visible survivors separately (this also bounds the total naturally:
    // 12 selectors × 80).
    const capped = [];
    const perSel = new Map();
    for (const d of out) {
      const n = (perSel.get(d.sel) ?? 0);
      if (n >= capPer) continue;
      perSel.set(d.sel, n + 1);
      capped.push(d);
    }
    // v2.8 STABLE TAGS: an element already carrying a tag KEEPS it — same
    // element, same id, zero churn. (Re-tagging with a fresh id would
    // silently invalidate the locators of any in-flight caller batch that
    // still holds the old id — the very bug the no-wipe rule fixes. Fresh
    // DOM nodes carry no tag and get ids from the cross-pass counter.)
    // `issued` lets the module advance CID_SEQ by exactly the ids allocated.
    let issued = 0;
    const list = capped.map((d) => {
      const shape = { sel: d.sel, i: d.i, scope: d.scope, tag: d.tag, text: d.text, tid: d.tid, title: d.title, aria: d.aria, href: d.href };
      const existing = d.el.getAttribute('data-replay-cid');
      if (existing != null) return { cid: Number(existing), ...shape };
      issued++;
      const id = ++cid;
      d.el.setAttribute('data-replay-cid', String(id));
      return { cid: id, ...shape };
    });
    return { list, issued };
  }, { sels: CLICKABLE, rootSel: rootSel ?? null, cidBase: CID_SEQ, capPer: 80 });
  CID_SEQ += raw.issued;   // advance by ids actually allocated — never reused
  const els = raw.list
    .filter((d) => d.text || d.tid || d.title || d.aria || d.href)   // aria-label counts as a signal — icon-only controls must not be silently dropped
    .filter((d) => !(d.href && /^(https?:|mailto:|javascript:)/.test(d.href)))   // v2.6: javascript: links execute page JS when "clicked" — never sweep them
    // v2.6: match EXCLUDES against semantic fields only. The old
    // JSON.stringify(d) matched the sel/tag fields too, so `--exclude
    // button` excluded EVERY button in the app.
    .filter((d) => !EXCLUDES.some((x) => [d.text, d.tid, d.title, d.aria, d.href].some((f) => f && String(f).includes(x))))
    // v2.6 LOCATOR SAFETY: resolve via the element's unique temporary
    // census attribute instead of `page.locator(sel).nth(i)`. The global
    // nth-index strategy was the hole under the v2.5 modal fix: census
    // returned modal-scoped children, but the global locator counted
    // page-level elements too, so probe() clicked a button UNDER the
    // dialog (verified: census said "Cancel", locator resolved to "Save").
    // The attribute exists on exactly the element census selected — modal
    // scoping now holds end-to-end by construction. Selftest (§7) asserts
    // 'data-replay-cid' is present in census's source.
    .map((d) => ({ ...d, loc: page.locator(`[data-replay-cid="${d.cid}"]`) }));
  console.log(`      [census] ${els.length} elements (${els[0]?.scope ?? 'page'} scope) in ${Date.now() - t0}ms`);
  console.log(`      [census] ${els.length} elements in ${Date.now() - t0}ms`);
  return els;
}
// v2.8: key carries the real census scope (modal/dropdown/page — v2.6's
// marker tested `el.cid != null`, which was true on EVERY post-cid record,
// so the marker was always 'y' and carried no information), plus the
// cross-pass-unique census id, so the same-looking control in a different
// scope or a later pass never collapses onto an earlier probe.
const dedupKey = (page, el) => page.url() + '|' + (el.scope ?? 'page') + '|' + el.sel + '|' + (el.cid ?? el.i) + '|' + el.text + '|' + (el.tid ?? '') + '|' + (el.href ?? '');
// v2.8.3 STALE-TAG RECOVERY (found live on saftbg): Svelte re-renders on
// NON-navigating interactions too (a filter panel re-rendering its list),
// which orphans the census tag of elements still visually present in the
// batch. The old behavior burned the full 3s actionability timeout and
// recorded click-failed for an element that was RIGHT THERE. Before the
// click (and again before the retry), verify the tag still resolves; if
// not, re-find the element by its semantic identity (sel + text + tid /
// title / aria / href) in the CURRENT DOM and re-tag it. Returns the element
// (original or recovered) or null when the element is genuinely gone.
// 'S'-prefixed ids can never collide with census-issued numeric ids.
const resolveFresh = async (page, el) => {
  if (await page.locator(`[data-replay-cid="${el.cid}"]`).count()) return el;   // tag still live
  const hit = await page.evaluate(({ sel, text, tid, title, aria, href, nextId }) => {
    const norm = (s) => (s ?? '').trim().replace(/\s+/g, ' ');
    for (const n of document.querySelectorAll(sel)) {
      if (n.getAttribute('data-replay-cid') != null) continue;   // never steal another element's tag
      if (tid && n.getAttribute('data-testid') !== tid) continue;
      if (href && n.getAttribute('href') !== href) continue;
      if (title && n.getAttribute('title') !== title) continue;
      if (aria && n.getAttribute('aria-label') !== aria) continue;
      if (text && !norm(n.innerText).includes(text)) continue;
      if (!(tid || href || title || aria || text)) continue;     // no identity to match on
      const id = 'S' + nextId;
      n.setAttribute('data-replay-cid', id);
      return id;
    }
    return null;
  }, { sel: el.sel, text: el.text, tid: el.tid ?? null, title: el.title ?? null, aria: el.aria ?? null, href: el.href ?? null, nextId: CID_SEQ + 1 }).catch(() => null);
  if (!hit) return null;
  CID_SEQ++;
  return { ...el, cid: hit, loc: page.locator(`[data-replay-cid="${hit}"]`) };
};
const fingerprint = (page) => page.evaluate(() => ({
  url: location.pathname + location.search,
  dlg: document.querySelectorAll('dialog[open], .modal-open').length,
  rows: document.querySelectorAll('tbody tr').length,
  open: document.querySelectorAll('details[open]').length,
  // v2.8 EXPANSION DETECTION: openVec catches exclusive <details name="group">
  // panels (opening one CLOSES its sibling — the total open count stays
  // equal, but the vector …110… → …101… moves); ariaExp catches hand-built
  // state-toggled accordions (a div + aria-expanded, no <details> at all).
  openVec: [...document.querySelectorAll('details')].map((d) => (d.open ? 1 : 0)).join(''),
  ariaExp: document.querySelectorAll('[aria-expanded="true"]').length,
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
    // v2.6: read REAL option values/labels — the old selectOption(i) passed a
    // numeric index, which Playwright treats as an option VALUE, so any select
    // whose values aren't "1","2",… threw (30s default timeout each, behind a
    // catch). Also: option labels/values now pass the DESTRUCTIVE guard — a
    // select titled "Filters" could enumerate a "Void all invoices" option
    // (reproduced live) and trigger it for real.
    const options = await page.evaluate((cidEl) => {
      const el = document.querySelector(`[data-replay-cid="${cidEl}"]`);
      if (!el) return [];
      return [...el.querySelectorAll('option')].map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() }));
    }, el.cid);
    if (DEEP_SELECTS) {
      for (const o of options) {
        if (o.value === before) continue;
        if (DESTRUCTIVE.test(`${o.label} ${o.value}`) && !ALLOW_DESTRUCTIVE) { console.log(`      ⚠ skip destructive option "${o.label}"`); continue; }
        await el.loc.selectOption(o.value, { timeout: 1500 }).catch(() => {}); await sleep(P.post);
      }
    }
    if (before !== null) await el.loc.selectOption(before, { timeout: 1500 }).catch(() => {});
    rec.result = `select-enumerated (${options.length} options)`; report.push(rec); return;
  }
  // §8 promised "retry-once after settle on click failure" — v2.5 never
  // implemented it (click failed → recorded → gone). Retry exactly once.
  // v2.8.3: both attempts go through resolveFresh — a tag orphaned by a
  // non-navigating re-render recovers instantly instead of burning two
  // 3s timeouts and recording click-failed for a visible element.
  let clickErr = null;
  const fresh = await resolveFresh(page, el);
  if (!fresh) { rec.result = 'click-failed: element gone after re-render'; report.push(rec); return; }
  try { await click(page, fresh.loc, 'sweep: ' + (el.text || el.sel)); }
  catch (e) {
    clickErr = e;
    await sleep(P.settle);
    const fresh2 = await resolveFresh(page, el);   // re-render may have happened between attempts
    if (fresh2) { try { await click(page, fresh2.loc, 'sweep retry: ' + (el.text || el.sel)); clickErr = null; } catch (e2) { clickErr = e2; } }
  }
  if (clickErr) { rec.result = 'click-failed: ' + String(clickErr?.message ?? clickErr).slice(0, 160); report.push(rec); return; }
  if (await page.locator('dialog[open], .modal-open').count()) {
    rec.result = 'modal-opened';
    // census() is modal-scoped (§5) AND its locators resolve through the
    // unique per-element data-replay-cid attribute, so every child here is
    // INSIDE the modal and clicking it really hits that element.
    for (const child of await census(page)) { if ((await probe(page, child, depth + 1, report)) === 'navigated') return 'navigated'; }
    // v2.8 CLOSE-MODAL LADDER: v2.7.1's only fallbacks were a button labeled
    // EXACTLY "Cancel" (Close/Dismiss/×/No never matched) and Escape (native
    // <dialog> only — the legacy checkbox/anchor-hack .modal-open has no
    // Escape handling). If neither closes it, the modal stayed open, census()
    // kept scoping to it, and the rest of the page was silently invisible
    // for the remainder of the route. Never auto-clicks OK/Yes/Confirm —
    // "confirming" an unknown dialog may EXECUTE a destructive action, which
    // is what the DESTRUCTIVE guard exists to prevent.
    if ((await closeModal(page, el.loc)) === 'stuck') {
      // One unclosable modal must never trap the sweep. Dialog state is
      // client-side — a reload of the route clears it. Record + abort the
      // batch (tags may be stale after re-render); caller re-censuses.
      rec.result = 'modal-opened (modal-stuck-reload)'; report.push(rec);
      await page.goto(BASE_URL + fp.url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await settleHydration(page);
      return 'navigated';
    }
  } else if (el.sel.includes('tbody tr')) {
    const panel = el.loc.locator('xpath=following-sibling::tr[1]');
    if (await panel.isVisible().catch(() => false)) {
      rec.result = 'row-expanded';
      for (const child of await census(page)) { if ((await probe(page, child, depth + 1, report)) === 'navigated') return 'navigated'; }
      // Collapse it back by re-clicking the ROW — the same gesture that
      // expanded it. v2.5 clicked locator('button').first() here, which in a
      // row whose buttons are [Edit] [Delete] hits EDIT — an arbitrary action,
      // not a toggle (reproduced). The row was what we clicked to expand;
      // the row is what we click to collapse. Escape covers sticky panels.
      await el.loc.click({ timeout: 1500 }).catch(async () => { await page.keyboard.press('Escape').catch(() => {}); });
    }
  } else {
    const fp2 = await fingerprint(page);
    if (fp2.url !== fp.url) {
      rec.result = 'navigated → ' + fp2.url;
      if (!fp2.url.startsWith('/login')) routeQueue.add(fp2.url);
      // v2.8.1 (found live on saftbg): this branch used to `return
      // 'navigated'` WITHOUT pushing rec — on a link-heavy app (most clicks
      // navigate) nearly every record was silently dropped and coverage
      // reported 0 clicked for a run that really clicked 20 times.
      report.push(rec);
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await settleHydration(page);
      // v2.6: a failed/no-op goBack leaves the sweep stranded on the
      // navigated-to page — every subsequent probe then runs against the
      // wrong route. Verify we actually made it back; hard-goto if not.
      const back = await fingerprint(page);
      if (back.url !== fp.url) await page.goto(BASE_URL + fp.url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await settleHydration(page);
      // v2.7.1 STALE-CENSUS SIGNAL (found live on saftbg): the navigation
      // re-rendered the route — Svelte replaced the DOM nodes census() had
      // tagged, so every data-replay-cid attribute is GONE. The remaining
      // cached locators in the caller's batch would each burn a 3s
      // scrollIntoView timeout and record click-failed (reproduced: 18/20
      // smoke clicks failed after one navigated probe). Return a signal so
      // the caller abandons the rest of THIS census batch; sweepRoute
      // re-censuses (fresh tags) and visited-dedup prevents re-probing.
      return 'navigated';
    } else if (fp2.open > fp.open || (fp2.open === fp.open && (fp2.openVec !== fp.openVec || fp2.ariaExp > fp.ariaExp))) {
      // v2.8 EXPANSION DETECTION — three reveal patterns, one branch:
      // (a) details[open] COUNT increase (native single accordion — v2.6);
      // (b) EQUAL count + changed openVec (exclusive <details name=group>:
      // one opened, its sibling closed — v2.7.1 never swept these);
      // (c) aria-expanded=true count increase (hand-built state-toggled
      // accordion divs — matched NO branch before, so their children were
      // found only by accident by the outer re-census, with depth reset to
      // 0 and no collapse step). All three recurse at depth+1 and collapse
      // by re-clicking the toggle.
      rec.result = 'details-expanded';
      for (const child of await census(page)) { if ((await probe(page, child, depth + 1, report)) === 'navigated') return 'navigated'; }
      // Close it by re-clicking the summary (the toggle), not Escape —
      // Escape doesn't close <details>.
      await el.loc.click({ timeout: 1500 }).catch(() => {});
    }
    else if (fp2.rows > fp.rows) { rec.result = 'rows-revealed'; for (const child of await census(page)) { if ((await probe(page, child, depth + 1, report)) === 'navigated') return 'navigated'; } }
  }
  for (let t = 0; t < 2; t++) {
    const now = await fingerprint(page);
    if (now.url === fp.url && now.dlg === fp.dlg) break;
    await closeModal(page, el.loc).catch(() => {});   // v2.8: full ladder, not Cancel-only
  }
  const fin = await fingerprint(page);
  if (fin.url !== fp.url || fin.dlg !== fp.dlg) {
    // v2.8: still not back to the pre-click state (unclosable modal or a
    // stray navigation the goBack branch missed) — never leave the sweep in
    // a dirty state; reload the route and abort the batch.
    rec.result += ' (state-unclean-reload)'; report.push(rec);
    await page.goto(BASE_URL + fp.url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await settleHydration(page);
    return 'navigated';
  }
  report.push(rec);
}
async function sweepRoute(page, url, report) {
  PHASE = 'sweep goto ' + url;
  await page.goto(BASE_URL + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await settleHydration(page);                       // once per navigation ONLY
  // v2.8 DROPDOWN-SCOPED CENSUS: v2.6 hovered + censused per parent, but
  // census() scoped only to a MODAL — a hover-opened dropdown isn't one, so
  // the loop censused and probed every visible clickable on the whole page
  // mid-hover. Clicking an ordinary page control navigates away or moves the
  // mouse off the dropdown, closing it before its own children were tested
  // (the background-click bug already fixed for modals, unaddressed here).
  // census(page, DROPDOWN_SEL) restricts the census to the open dropdown;
  // when no dropdown opened (returns []), skip probing — the main sweep
  // loop right below covers page-level elements anyway.
  for (const parent of Object.keys(NAV_TREE)) {
    if (!parent) continue;
    await navHoverLoc(page, parent).hover({ timeout: 1500 }).catch(() => {});
    await sleep(300);
    const dropdownEls = await census(page, DROPDOWN_SEL);
    if (!dropdownEls.length) { await page.mouse.move(6, 6).catch?.(() => {}); await sleep(200); continue; }
    report.push({ route: page.url(), sel: DROPDOWN_SEL, text: parent, depth: 0, result: 'dropdown-opened (' + dropdownEls.length + ' items)' });
    // v2.7.1: a navigated probe invalidates this batch's census tags — stop
    // probing it; the next census re-tags fresh nodes (visited-dedup holds).
    for (const el of dropdownEls) { if ((await probe(page, el, 0, report)) === 'navigated') break; }
    await page.mouse.move(6, 6).catch?.(() => {}); await sleep(200);   // close this dropdown before the next parent
  }
  let elements = await census(page); let guard = 0;
  // v2.6 LOOP FIX: the old break condition `elements.length >= before`
  // exited when a probe round revealed exactly as many new elements as it
  // consumed — a +1-per-click lazy-load hit equality on iteration 1 and
  // every remaining revealed element was skipped. Continue while ANY
  // unvisited elements remain; `guard` still bounds the loop.
  while (elements.length && guard++ < 8) {
    // v2.7.1: same stale-batch rule as above — abandon the round's remainder
    // when a probe navigates; the re-census below re-tags fresh nodes.
    for (const el of elements) { if ((await probe(page, el, 0, report)) === 'navigated') break; }
    elements = (await census(page)).filter((el) => !visited.has(dedupKey(page, el)));
  }
  await shot(page, 'sweep-' + url.replace(/[^a-z0-9]+/gi, '_'));
}
function writeCoverage(report) {
  // v2.6: `clicked` counts every result that implies a real click landed —
  // modal-opened/row-expanded/rows-revealed/dropdown-opened/details-expanded/
  // navigated are all successful interactions the old stat silently dropped
  // (a run with 50 real clicks reported "clicked: 12"). Per-result breakdown
  // keeps the raw numbers visible.
  const CLICK_RESULTS = (r) => r.result === 'clicked' || r.result.startsWith('select') || r.result === 'modal-opened' ||
    r.result === 'row-expanded' || r.result === 'rows-revealed' || r.result === 'dropdown-opened' ||
    r.result === 'details-expanded' || r.result.startsWith('navigated');
  const byResult = {};
  for (const r of report) { const key = r.result.split(' ')[0].split('→')[0].trim(); byResult[key] = (byResult[key] ?? 0) + 1; }
  const stats = { routes: new Set(report.map((r) => r.route)).size, elements: report.length,
    clicked: report.filter(CLICK_RESULTS).length,
    'skipped-destructive': report.filter((r) => r.result === 'skipped-destructive').length,
    failed: report.filter((r) => r.result.startsWith('click-failed')).length,
    byResult };
  mkdirSync('plan/replay', { recursive: true });
  writeFileSync('plan/replay/coverage.json', JSON.stringify({ ...stats, records: report }, null, 2));
  writeFileSync('plan/replay/coverage.md', '# Coverage\n\n' + Object.entries(stats).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n') +
    '\n\n## Failed / skipped\n' + report.filter((r) => r.result.startsWith('click-failed') || r.result === 'skipped-destructive')
      .map((r) => `- ${r.route} | ${r.sel} | ${r.text} | ${r.result}`).join('\n'));
  console.log('\n✓ coverage written: plan/replay/coverage.{json,md} — ' + JSON.stringify(stats));
}

===============================================================================
6. PARAM RESOLUTION + WARM-UP
===============================================================================
resolveParam(route, cid): 1) PARAM_OVERRIDES[name]; 2) cid if known;
3) live: goto nearest param-less prefix, read first a[href] matching the route
shape — if the prefix yields nothing (commonly a 404 or an index-less
section), retry the scan on each HUB_ROUTES page (§4.1: entity hubs like
/companies link to /<section>/:id routes);
else return null → record {route, result:'skipped-unresolvable'}.
This MUST be implemented as an actual named function `resolveParam` — it is
now part of the --selftest wiring check (§7), so a generated script that
only describes this logic in a comment will fail --selftest instead of
silently shipping with unresolvable dynamic routes.

// §6.1 — resolveParam (embedded — copy verbatim; MANIFEST generated by Phase A)
// Resolve dynamic route params to concrete ids. Order: explicit --param
// override → known company id → live discovery (visit the nearest
// param-less prefix and read the first in-app link whose href matches the
// route's shape). Returns the filled route path, or null when unresolvable
// (caller records { route, result: 'skipped-unresolvable' }).
async function resolveParam(page, route) {
  // route like '/invoices/:id/edit' — fill each :param left to right.
  const parts = route.split('/').filter(Boolean);
  const out = [];
  for (let idx = 0; idx < parts.length; idx++) {
    const p = parts[idx];
    if (!p.startsWith(':')) { out.push(p); continue; }
    const name = p.slice(1);
    if (PARAM_OVERRIDES[name]) { out.push(PARAM_OVERRIDES[name]); continue; }
    if (COMPANY && (name === 'cid' || name === 'companyId' || name === 'company')) { out.push(COMPANY); continue; }
    // live discovery: the param-less prefix already filled so far is where
    // app links to this route live — visit it and scan in-app hrefs.
    const prefix = '/' + out.join('/');
    await page.goto(BASE_URL + (prefix === '/' ? '' : prefix), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await settleHydration(page);
    // href must extend the prefix with at least one concrete segment:
    // prefix '/invoices' + shape ':id(/edit)' matches '/invoices/42' or
    // '/invoices/42/edit' — never '/invoices' itself.
    const href = await page.evaluate((pref) => {
      const esc = pref.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp('^' + esc + '/[^/]+(/.*)?$');
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.getAttribute('href') ?? '';
        if (h.startsWith('/') && !h.startsWith('//') && re.test(h)) return h;
      }
      return null;
    }, prefix).catch(() => null);
    // v2.8.1 HUB FALLBACK (found live on saftbg): many apps don't link to
    // '/<segment>/:id' pages from a '/<segment>' index — the links live on
    // an ENTITY HUB (e.g. /companies links to /dashboard/:company_id,
    // /accounts/:company_id, /reports/:company_id/…). If the prefix page
    // yielded nothing (or 404'd), retry the same scan on each known hub
    // route before giving up. A hub hit fills ALL remaining :params at once
    // (a /companies href like /documents/7/view/3 matches the whole
    // multi-param shape).
    let href2 = href;
    if (!href2) {
      for (const hub of HUB_ROUTES) {
        if (hub === prefix) continue;
        await page.goto(BASE_URL + hub, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await settleHydration(page);
        href2 = await page.evaluate((pref) => {
          const esc = pref.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const re = new RegExp('^' + esc + '/[^/]+(/.*)?$');
          for (const a of document.querySelectorAll('a[href]')) {
            const h = a.getAttribute('href') ?? '';
            if (h.startsWith('/') && !h.startsWith('//') && re.test(h)) return h;
          }
          return null;
        }, prefix).catch(() => null);
        if (href2) break;
      }
    }
    if (!href2) return null;
    const segs = href2.split('/').filter(Boolean);
    const known = out.length;                 // segments already filled
    const take = segs.length - known;         // concrete segments the link reveals
    if (take < 1) return null;
    out.push(...segs.slice(known));           // fill this (and any later) :params at once
  }
  return '/' + out.join('/');
}

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
    const UNTIL = UNTIL_ARG != null ? (parseInt(UNTIL_ARG, 10) || PARTS.length) : PARTS.length;
  (See §3 CRITICAL note — never slice with UNTIL_ARG directly. The
  `|| PARTS.length` also catches `--until abc` → NaN, which plain parseInt
  propagates into slice(0, NaN) = zero parts — v2.5's own derivation had
  exactly this hole.)
- --selftest: assert typeof === 'function' for [glide,click,type,fill,pickSelect,
  pickSelectContains,toast,census,probe,sweepRoute,nav,backupDatabase,
  restoreDatabaseBackup,resetViaForm,fingerprint,center,settleHydration,
  waitToastClear,openModalCancel,shot,writeCoverage,resolveParam,
  startDevServer,stopDevServer,wirePageGuards,navHoverLoc,closeModal,resolveFresh]; assert CURSOR_JS contains
  'replay-cursor' and 'rc-pulse' AND injects its styles via
  adoptedStyleSheets with a <style> fallback (v2.7: a style-src-restricted
  CSP strips a bare <style> injection and the demo silently loses the cursor);
  assert CLICKABLE.length >= 10; assert each of
  click.toString(), type.toString(), fill.toString(), pickSelect.toString(),
  pickSelectContains.toString() contains 'glide(' — this is what guarantees
  the recorded cursor actually tracks every interaction rather than just
  existing as an unused overlay; BEHAVIORAL assertions (v2.6 — source
  substrings alone passed while the mechanism was broken downstream):
  assert census.toString() contains 'data-replay-cid' AND 'cidBase' AND
  'scope' — proves census resolves locators through the unique per-element
  census attribute seeded from the module counter (unique across passes)
  and records which scope (modal/dropdown/page) each element came from,
  which is what makes modal/dropdown scoping hold END-TO-END (census scope
  alone wasn't enough: the old global nth() locator still clicked background
  elements, and the old per-pass counter let two passes collide);
  assert restoreDatabaseBackup.toString() contains 'REFUSING TO RESTORE' —
  proves the verify-main-backup-before-touching-live-files guard exists;
  assert backupDatabase.toString() contains 'slice(0, 14)' — proves the
  seconds-precision stamp; print PASS/FAIL; process.exitCode =
  missing.length ? 1 : 0; return WITHOUT launching a browser.
- await startDevServer();  (§4.7 — before the browser launches: the crawl
  needs BASE_URL reachable and login happens inside it.)
- v2.8 BACKUP BRACKET (safety-critical ordering — do NOT "optimize" away):
    await stopDevServer();
  const stamp = backupDatabase();
    await startDevServer();
  backupDatabase() does three SEPARATE copyFileSync calls on the live
  .db/-wal/-shm files. With the server still running, a write landing
  mid-copy yields a torn snapshot — the exact unsynchronized multi-file copy
  of an open DB that §4.6's whole design exists to prevent on restore. The
  snapshot must capture a quiescent DB: server STOPPED during the copy,
  restarted after. (startDevServer() runs before the browser launches, so
  login/sweep still see a reachable app.)
- process.on('SIGINT', () => {
    // try/catch/finally: v2.5 had none — a stopDevServer() throw skipped the
    // restore AND skipped the exit, leaving a hung process with a mutated DB.
    (async () => {
      try { await stopDevServer(); restoreDatabaseBackup(stamp); await startDevServer(); }
      catch (e) { console.error('SIGINT rollback failed:', e?.message ?? e); }
      finally { process.exit(130); }
    })();
  });
- chromium.launch({ headless: HEADLESS }); context viewport 1440×900;
  await context.addInitScript(CURSOR_JS);  (context FIRST, then newPage —
  addInitScript re-injects on every subsequent full navigation in this
  context automatically, so a single call before the first page covers the
  whole run, including any hard reloads.)
- wirePageGuards(page);  (§4.3 — IMMEDIATELY after the page exists and BEFORE
  login/sweep: registers native-dialog auto-dismiss and popup auto-close so
  alert()/confirm()/window.open can't stall or derail the run.)
- page.on('response'): log POSTs; on body.type==='failure' print action+data.
  page.on('console'): forward [debug-*] lines.
- login ×3 with scanned selectors (via type()/click(), so the login flow is
  gliding and cursor-visible too — never bypass the helpers here even though
  it happens before the main sweep). Select company (--company or first card).
- MODE scripted/both → PARTS.slice(FROM, UNTIL); MODE sweep/both → warm-up +
  drain routeQueue (seed: manifest routes resolved via resolveParam +
  NAV_TREE hrefs + /companies cards; cap 60; 401/403 → skipped-forbidden).
- END: writeCoverage(report); await stopDevServer(); const restored =
  restoreDatabaseBackup(stamp); await startDevServer(); rollback = restored
  || (await resetViaForm(page)) || manual hint. SAME in catch. Print stack
  BEFORE closing the browser; process.exitCode = 1; NEVER process.exit()
  (except SIGINT and the teardown watchdog). browser.close() MUST go through
  teardown(browser) (§4.3) — v2.7.1: a sweep that opened dialogs/popups can
  wedge the driver pipe and hang inside close() FOREVER (found live on
  saftbg); the watchdog kills orphaned Playwright browsers and forces the
  exit. stopDevServer()/startDevServer() MUST bracket the
  restoreDatabaseBackup() call specifically — never resetViaForm(), which
  needs the server running to navigate and so only ever runs AFTER
  startDevServer() resolves — on every exit path (normal end, catch block,
  SIGINT alike), so the DB files are never touched while the dev server
  still has them open, and the server is always left running for the user
  afterward.

===============================================================================
8. ROBUSTNESS / REPORT / RUNBOOK / FAILURE (unchanged from v1, still mandatory)
===============================================================================
- Hydration: settleHydration once per navigation; retry-once after settle on
  click failure. Toasts: waitToastClear before nav; toast() logs ✓/⚠.
- <select>: focus+selectOption only. Expand-vs-toggle: check details.open first.
- Modal detection: `dialog[open], .modal-open` — covers current daisyUI
  (native <dialog>+showModal, no class change) and the legacy checkbox/anchor
  hack (`.modal.modal-open`). Do not narrow this back to a single selector.
  This same selector is also census()'s scoping root (§5): when it matches,
  census/probe operate ONLY inside that element (modal buttons only); when
  it doesn't match, they operate on the whole document (page buttons only).
  Never let one probe pass see both layers at once.
- DB restore is always bracketed by stopDevServer()/startDevServer() (§4.7),
  never called on its own — on Windows, copying snapshot files back over a
  DB the dev server still has open can desync/corrupt the `-shm` index.
  Stop, wait for the handle to release, copy, then restart, on every restore
  path (end of run, catch block, SIGINT). v2.8: the BACKUP is bracketed the
  same way (§7) — copying the live .db/-wal/-shm while the server runs can
  tear the snapshot itself, and restore would then faithfully "restore" a
  corrupt DB. `--no-manage-dev-server` trades this automatic safety for a
  printed manual-restart prompt when the script must not own the server's
  process (backup/restore are skipped with a warning in that mode — the
  script cannot make the externally-owned server release its handles).
- Dedup key: url|modal-scope|sel|census-id|text|tid|href — MUST include the
  census id (v2.6: the data-replay-cid value; unique per element per pass)
  and href when present, or repeated per-row controls (Edit/Delete in a
  table) collapse onto one probe and every row after the first is skipped.
- Destructive guard tests text + title + aria-label (icon-only buttons rely
  on aria-label having no visible text/title at all); word-boundary anchored
  (v2.6) so "Avoid" doesn't match `void`; ALSO applied per-option during
  --deep-selects enumeration (option labels/values previously bypassed it).
- Destructive guard; void-not-delete; downloads fetched in-page (§1 A3);
  native dialogs auto-dismissed and popups auto-closed by wirePageGuards()
  (§4.3, wired in §7 main()).
- coverage.md lists every failure with route+selector+text.
- Runbook: node --check → --selftest → 20-click headless smoke → headed
  recording (--normal) with `2>&1 | tee plan/replay/run.log`.
- Failure: stop on first unrecoverable locator error naming route/selector;
  rollback snapshot-first; exitCode 1; budget hit → partial report, exit 0.
