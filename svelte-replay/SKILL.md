---
name: svelte-replay
description: Self-contained, zero-dependency generator of recorded, cursor-visible Playwright
  replay scripts for ANY SvelteKit app. Scans the whole codebase (routes, server
  actions, endpoints, navbar, login form, DB file) to build a manifest from scratch,
  then emits ONE Node ESM script that exhaustively sweeps every route, button, link,
  tab, dropdown, modal, select, checkbox and expandable row — recursing into every
  child element revealed, modal-scoped so an open dialog never lets the sweep click
  a page button hiding behind it — with a gliding in-page cursor overlay, a
  Windows-safe DB snapshot/restore safety net for local SQLite-file databases
  (dev server stopped before restore, restarted after) — the sweep REFUSES to
  run against a remote/non-file database (Turso/libSQL, Postgres, MySQL,
  Mongo, etc.) unless the operator explicitly acknowledges the risk or
  supplies a rollback route (authored `--mode scripted` runs are exempt:
  they never sweep, they only run the hand-written steps) — heartbeat
  liveness logging, and a coverage
  report. Use when asked
  to "replay the app", "test every button/clickable", "full UI coverage sweep", or
  "build a demo recording from scratch". All outputs live under plan/replay/.
---

svelte-replay — full-app recorded replay + exhaustive UI sweep (v2.9.4, self-contained)

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

MODE DETECTION (v2.9): if src/routes/**/+page.svelte exists → SvelteKit mode
(scan proceeds with A1–A7 below). If src/app.html + src/main.js|ts exist but
src/routes does NOT → SPA mode (A1b; A2–A3 are skipped, A4–A7 still run).
Neither → abort with an explanatory message (not a Svelte/SvelteKit app).

A1 ROUTES: glob src/routes/**/+page.svelte → paths. Before converting to a
   URL: (a) DROP any path segment matching ^\(.*\)$ — SvelteKit route groups,
   e.g. (app)/dashboard/+page.svelte → /dashboard — they scope +layout.svelte
   only and never appear in the URL; a route file living under a group still
   contributes its ACTIONS/LOGIN/etc scan (A2-A4) via its real file path,
   only the emitted URL drops the group segment; (b) strip a trailing
   `=matcherName` from a bracketed segment (e.g. [id=integer] → [id]) —
   matchers validate at compile time and are never part of the param name;
   then (c) [p] → :p, [...p] → *p, [[p]] → :p (optional param — also
   register the param-less route so both forms get swept). Collapse
   duplicate URLs that two different groups resolve to after stripping.
A1b ROUTES (SPA mode): the scan CANNOT derive routes from files, so it
   discovers them from the source instead — (a) every string literal passed
   to router APIs (svelte-spa-router: `Router({ routes: [...] })` entries
   and `navigate('/x')`; svelte-routing: `navigate('/x')`; the built-in
   `history.pushState/replaceState` and `goto('/x')` calls), (b) every
   `href="/x"` and `to="/x"` literal on `<a>`/`<Link>` in src/**/*.{svelte,js,ts},
   (c) `--routes /a,/b/:id` CLI override (comma-separated; `:name` segments
   become params). Strings are captured ONLY when they start with `/` and
   contain no spaces or template interpolation — a literal is a route
   candidate, not a fact. Dead routes surface during the queue drain, not
   from a pre-sweep probe: the emitted main() has no per-route HTTP/JS
   verification pass — every queued route is warm-up-goto'd and then
   sweepRoute()'d, and a route that fails to render/run yields a
   `route-failed` record in coverage while the run continues. Duplicate
   prefixes collapse; paths found only inside comments are kept (harmless:
   an unusable route produces a route-failed record, nothing stops).
A2 ACTIONS: +page.server.ts `export const actions` names per route. (Skipped
   in SPA mode — no server actions by definition; form posts, if any, are
   swept as UI interactions only.)
A3 ENDPOINTS: +server.ts GETs that return files (downloads) — NOT
   IMPLEMENTED by the current generator: the A1 route scan covers
   +page.svelte only, so a +server.ts download endpoint is never queued,
   and the emitted sweep fetches no raw endpoints. A download is exercised
   only if a page the sweep visits links to it (Playwright handles the
   download as an ordinary navigation) or an author adds an explicit PARTS
   step. (Skipped in SPA mode.)
A4 LOGIN: route + selectors scanned from the login markup
   (input ids/names/types, submit button text). Fallbacks if scan finds
   nothing: #login-email / #login-password / button "Log in".
A5 NAVBAR: header/nav/menu/sidebar components (*.svelte files whose PATH
   matches nav|header|menu|sidebar) → NAV_TREE = { '': [every link found],
   'Parent': [{label, href}...] } — parent groups come from three generic
   patterns, all best-effort regex (Svelte is not parsed): (a) native
   <details><summary>Label</summary> groups; (b) dropdown menus (a
   role="button"/tabindex label followed by a .dropdown-content link list);
   (c) nested <li>Label<ul> lists. Menus built any other way (custom
   components, JS-driven popups) yield top-level links only — hand-add the
   parent entry to NAV_TREE in the emitted script. Drives the dropdown
   hover-open census in sweepRoute (§5) and nav() lookups for authored PARTS.
   It does NOT seed the drain queue — the queue is the MANIFEST route list
   (§7); NAV_TREE destinations are +page.svelte routes already in the
   manifest and are reached in-page while their route is swept.
A6 DB: grep for sqlite path (dev.db|*.sqlite|DB_PATH|better-sqlite3) → dbGuess,
   dbKind: 'sqlite-file'. If that yields nothing, grep for signs of a
   non-file database and set dbKind: 'remote' instead (still dbGuess: null —
   there is no local file to snapshot): @libsql/client or a `libsql:`/
   `https:` createClient() url (Turso), TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
   env names, the `postgres`/`pg` packages or a DATABASE_URL starting
   postgres:// or postgresql://, mysql2, mongodb/mongoose. Anything matching
   neither is dbKind: 'unknown'. dbKind is baked into the manifest so the
   emitted script's DB-safety message is specific ("this app's database
   can't be file-snapshotted — point BASE_URL at a disposable copy/branch
   before sweeping, or supply --reset-url") rather than the generic
   "file missing" wording. The generator also prints the kind at
   generation time (⚠-prefixed for remote/unknown) and bakes a `// DB: …`
   line into the emitted script's header, so a remote-DB app is flagged
   BEFORE the first run, not when the no-rollback gate fires. Also detect
   reset route (reset|restore-baseline) → resetHint.
A7 Per-route <select>/dialog/details density (advisory for the report).

===============================================================================
2. PHASE B — EMIT plan/replay/replay-all.mjs
===============================================================================
One Node ESM file. Imports ONLY: playwright, node:fs, node:child_process, node:path.
Actual order in the generated file (scripts/generate.mjs splices the SKILL
blocks in this sequence): (1) MANIFEST consts — manifest data + NAV_TREE +
the PARTS array (empty by default); (2) the §4.1 CLI block (FLAG_HELP +
strict argv validation + --help); (3) the §4 helper blocks (cursor, guards,
nav, reset, DB snapshot/restore, dev-server lifecycle); (4) §5
census/probe/sweep; (5) §6.1 resolveParam; (6) the §7 main() block — UNTIL
is derived at the top of that block (before main() runs; see §3), which is
why PARTS must already be in scope from (1). The CLI lives after the
MANIFEST consts rather than at the very top because the consts carry the
baked app facts — the argv validation runs at load time and only reacts to
process.argv, so ordering is irrelevant to it.

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
3. CLI — TWO SURFACES: generator-time flags vs replay-time flags
===============================================================================
The generated replay script (plan/replay/replay-all.mjs) accepts EXACTLY the
flags in the §4.1 FLAG_HELP table. That table is canonical: it drives both
the strict validator and the printed `--help`, so the list below can never
drift from what the script actually accepts. The generator (scripts/
generate.mjs) has its own table (GEN_FLAG_ARITY + printUsage). Flags marked
baked are fixed into the manifest at scan time; the generator accepts them
so the emitted script is self-describing, and the replay flag of the same
name overrides the baked default at run time.

REPLAY-TIME FLAGS (plan/replay/replay-all.mjs):
  --help --headless --normal --selftest
  --mode sweep|scripted|both (default both) --from N --until N
  --max-clicks N (2000) --allow-destructive --exclude TEXT (repeatable)
  --deep-selects --month YYYY-MM --shot-dir DIR
  --base-url URL --user U --pass P --company ID
  --db-path FILE --backup-dir DIR (default plan/replay/db-backups)
  --skip-backup --reset-url /route --i-accept-no-db-rollback
  --no-manage-dev-server --hub-routes /a,/b
  --param name=value (repeatable) --hash-routes (override the baked default)
  --dev-cmd CMD (default "npm run dev") --dev-cwd DIR (default ".")
  --dev-ready-path PATH (default "/") --dev-ready-timeout N (default 30000)

GENERATOR-TIME FLAGS (scripts/generate.mjs — baked into the manifest; the
replay script REJECTS these with exit code 2, because a run cannot change the
app facts it was generated for):
  --help (print the usage and exit 0; wins over other flags)
  --no-login (force-skip the login phase even if the scan found one — for
    sweeps that must stay logged-out, e.g. testing the public surface)
  --after-login /route (default /home: where the app lands after a successful
    login — the post-login verification target. Windows Git Bash caveat:
    MSYS2 rewrites leading-slash CLI args into Windows paths (even after a
    '#'); the generator refuses drive-letter-shaped values loudly, and
    `MSYS_NO_PATHCONV=1` disables the rewriting.)
  --company-hub /hub (entity-hub route for resolveParam; default /companies;
    '' = none)
  --routes /a,/b/:id (SPA mode: explicit route list overriding/completing the
    A1b source scan; `:name` segments are params resolved via §6)
  --param name=value (seed resolveParam overrides; repeatable)
  --app-name NAME (manifest label; default: folder name)

BOTH SURFACES (generator bakes the default; replay honors the same flag):
  --base-url URL --hash-routes --user U --pass P --db-path FILE

--hash-routes (v2.9): the app is a hash-routed SPA — svelte-spa-router etc.
  The document URL path never changes; routes live in the URL fragment. All
  app navigation goes through toAppUrl()/toDocUrl(), and fingerprint() counts
  the fragment as part of route identity. Path-routed apps are unaffected —
  this flag is identity for them. scripts/generate.mjs bakes it into the
  generated script at scan time, so the emitted script is self-describing.

--no-manage-dev-server (replay): assume an externally-managed dev server;
  restore falls back to printing a manual restart instruction instead of
  spawning or killing anything — see §4.7.

--i-accept-no-db-rollback (replay, v2.9.2): required to proceed when no DB
  snapshot could be taken — remote/non-file DB, --skip-backup, or
  --no-manage-dev-server — AND no --reset-url was given. Deliberately
  explicit and a little awkward to type: without it or a --reset-url, main()
  (§7) aborts before the browser launches rather than running an exhaustive
  click/submit sweep against data with no way back. See §4.6/§7. v2.9.3:
  NOT required for a `--mode scripted` run — authored PARTS-only runs never
  drain the route queue and are exempt via runIsInert; sweep/both runs need
  this flag or a --reset-url.

NOTE (v2.9.3): unknown flags and unexpected positional args are HARD ERRORS
(exit code 2) in BOTH the generator and the emitted replay script — the §4.1
embedded code validates the whole argv against its flag table before any flag
takes effect, and scripts/generate.mjs does the same for its own CLI. A stale
`--project` (a flag that never existed for the generated script and was
removed from the generator) is rejected with a specific message instead of
silently falling through to the default mode, and `--mode typo` was already
rejected by the mode guard. A typo'd flag must never quietly run a full
sweep with the wrong intent. `node plan/replay/replay-all.mjs --help` and
`node scripts/generate.mjs --help` print every accepted flag with a one-line
description (plus the three gates, replay only) and exit 0 — the help text
lives in the SAME table the validator derives its arities from, so the
printed list can never drift from what is accepted, and `--help` wins even
when other (even unknown) flags are present.


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

CRITICAL: `backupDatabase()` returning `null` must never be treated as "safety
declined gracefully" — it means the run that's about to submit forms and
fire +page.server.ts actions across the whole app has NO way back. This is
the common case, not an edge case: A6 only recognizes a local SQLite file,
so it returns null on Turso/libSQL, Postgres, MySQL, Mongo, or any DB the
scan doesn't recognize — silently, on the first run, with nothing else
wrong. §7's main() checks `if (!runIsInert && !stamp && !RESET_URL && !NO_ROLLBACK_ACK)`
immediately after the backup/restart bracket and aborts with exit code 1
before `chromium.launch()` — the dev server is left running either way (the
bracket's final `startDevServer()` already ran), only the browser/sweep is
withheld. `runIsInert` is the ONE deliberate exemption: a `--mode scripted`
run executes only hand-authored PARTS (it never drains the route queue — §7
MODE routing), so it fires nothing the operator didn't write by hand;
sweep/both runs always drain the queue and are never exempt, and a
logged-out SPA public-surface sweep is NOT exempt either (public forms
mutate remote data). `--i-accept-no-db-rollback` or `--reset-url` is the
only way past the gate for those runs; there is no default that silently
proceeds.

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
Immediately after PARTS is declared (§2 step 7), validate and derive:
  if (UNTIL_ARG != null && !Number.isFinite(parseInt(UNTIL_ARG, 10))) { console.error('✗ invalid --until "' + UNTIL_ARG + '" (expected a number)'); process.exit(2); }
  const UNTIL = UNTIL_ARG != null ? parseInt(UNTIL_ARG, 10) : PARTS.length;
and use `PARTS.slice(FROM, UNTIL)` everywhere (§7). Never reference
UNTIL_ARG directly outside this derivation. (Absent → all parts; `0` is
honored and means "run none" — v2.9.3's `|| PARTS.length` swallowed it into
"run all". A present-but-non-numeric value exits 2 like any malformed flag.)

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
// v2.9.3 STRICT CLI + --help — ONE ordered flag table (name, arity, help
// text) drives BOTH the validator and the printed usage, so `--help` can
// never drift from what the validator accepts (and vice versa). Arity 0 =
// boolean; 1 = takes exactly one value token (repeatable flags like
// --exclude/--param take one token per occurrence). Unknown flags and stray
// positional args exit with code 2 BEFORE any flag takes effect — a stale
// --project or a typo'd flag must not silently run the DEFAULT mode with the
// wrong intent.
const FLAG_HELP = [
  ['help', 0, 'print this flag list + the three gates, then exit 0'],
  ['headless', 0, 'hide the browser window (default: visible)'],
  ['normal', 0, 'slow, recording-pace cursor (fast is the default)'],
  ['selftest', 0, 'verify wiring, no browser/app launch'],
  ['mode', 1, 'sweep | scripted | both — what this run does (default both)'],
  ['from', 1, 'first PARTS index to run, 0-based (default 0)'],
  ['until', 1, 'last PARTS index to run (default: all parts)'],
  ['max-clicks', 1, 'global click budget (default 2000)'],
  ['base-url', 1, 'app URL (default http://localhost:5173; baked in at generation)'],
  ['user', 1, 'login username/email (default "1")'],
  ['pass', 1, 'login password (default "1")'],
  ['company', 1, 'entity id filling :cid/:companyId/:company route params (generic: prefer --param name=value)'],
  ['hash-routes', 0, 'app routes live in the URL fragment (baked in at generation)'],
  ['hub-routes', 1, 'entity-hub pages scanned for dynamic-route links (default /companies,/home)'],
  ['param', 1, 'pin a dynamic-route param: --param name=value (repeatable)'],
  ['exclude', 1, 'skip elements whose text/testid/title/aria/href contains TEXT (repeatable)'],
  ['allow-destructive', 0, 'click delete/logout-shaped controls (default: skipped-destructive)'],
  ['deep-selects', 0, 'enumerate every <select> option instead of sampling'],
  ['skip-backup', 0, 'do not snapshot the DB'],
  ['backup-dir', 1, 'snapshot directory (default plan/replay/db-backups)'],
  ['db-path', 1, 'SQLite file to snapshot/restore (default: manifest DB or $DB_PATH)'],
  ['reset-url', 1, 'route that restores known-good data when no snapshot exists'],
  ['i-accept-no-db-rollback', 0, 'proceed with no snapshot and no --reset-url (SKILL §3: the explicit escape hatch)'],
  ['no-manage-dev-server', 0, 'assume an external dev server owns BASE_URL; never spawn or kill it'],
  ['dev-cmd', 1, 'dev server command (default "npm run dev")'],
  ['dev-cwd', 1, 'dev server working directory (default ".")'],
  ['dev-ready-path', 1, 'URL path polled for dev-server readiness (default "/")'],
  ['dev-ready-timeout', 1, 'readiness-poll timeout in ms (default 30000)'],
  ['month', 1, 'YYYY-MM grouping for the report (default: current month)'],
  ['shot-dir', 1, 'save per-sweep screenshots into this directory'],
];
const FLAG_ARITY = Object.fromEntries(FLAG_HELP.map(([n, a]) => [n, a]));
function printHelp() {
  console.log(`svelte-replay replay-all.mjs — generated by svelte-replay (SKILL.md is the spec)
Usage: node replay-all.mjs [flags]

Flags:
${FLAG_HELP.map(([n, a, d]) => `  --${n}${a ? ' <value>' : ''}   ${d}`).join('\n')}

Three gates, in order (from the app root):
  1. node --check plan/replay/replay-all.mjs
  2. node plan/replay/replay-all.mjs --selftest
  3. node plan/replay/replay-all.mjs --headless --mode sweep --max-clicks 20`);
  process.exit(0);   // printHelp() IS the exit — never fall through into main()
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') printHelp();   // --help wins anywhere on the line
  const t = args[i];
  if (!t.startsWith('--')) {
    const prev = args[i - 1];
    if (!(prev && prev.startsWith('--') && FLAG_ARITY[prev.slice(2)] === 1)) {
      console.error(`✗ unexpected positional argument "${t}" — this script takes flags only (see SKILL.md §3 for the flag list)`);
      process.exit(2);
    }
    continue;
  }
  const name = t.slice(2);
  if (!(name in FLAG_ARITY)) {
    console.error(name === 'project'
      ? '✗ --project was REMOVED: the replay script is generated per-app and takes no project path — run plan/replay/replay-all.mjs from the app root and pass the §3 flags'
      : `✗ unknown flag --${name} — stale or typo'd flags are NOT silently ignored (exit code 2). See SKILL.md §3 for the accepted flags.`);
    process.exit(2);
  }
  if (FLAG_ARITY[name] === 1 && (args[i + 1] == null || args[i + 1].startsWith('--'))) {
    console.error(`✗ --${name} needs a value (next argument missing or looks like a flag)`);
    process.exit(2);
  }
}
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
// v2.9.4 STRICT NUMERICS: a present-but-non-numeric value is a typo, not a
// default — exit 2 like any other malformed flag instead of silently running
// with the wrong budget/slice.
const reqInt = (n, d, min) => {
  const raw = val(n, null);
  if (raw == null) return d;
  const v = parseIntSafe(raw, NaN);
  if (!Number.isFinite(v)) { console.error(`✗ invalid --${n} "${raw}" (expected a number)`); process.exit(2); }
  return Math.max(min, v);
};
const HEADLESS = has('headless');   // default: visible. Only --headless hides the window.
const FAST = !has('normal');        // default: fast. Pass --normal for the slow, recording-pace cursor.
const BASE_URL = val('base-url', 'http://localhost:5173');
// v2.9 hash-SPA adapter: hash-routed SPAs (svelte-spa-router etc.) keep the
// document URL path fixed (often just '/') and carry the route in the URL
// fragment (BASE_URL/#/route). All app-level navigation below goes through
// toAppUrl(), which prefixes '#'. Path-routed apps (SvelteKit, SPA with the
// History API) are unaffected — identity. goBack() still returns to the
// literal document URL because that is what the browser history stores.
const HASH_ROUTES = has('hash-routes');
// v2.9.3 FRAGMENT-AWARE NORMALIZATION: hash-SPA fp urls look like '/#/tasks'
// (document pathname + fragment) — the ROUTE is the fragment content. The old
// toDocUrl stripped only a LEADING '#', so '/#/tasks' survived whole: probe()
// queued it as a route and toAppUrl('/#/tasks') produced a DOUBLE hash
// ('#/#/tasks') whose fragment the router reads as '/#/tasks' — a dead route.
// Normalize both directions: strip the fragment (and, for hash apps, the
// constant document path) to get the plain route, then '#' + route back to a
// document URL. Path-routed apps never put '#' in fp urls, so both helpers
// are identity for them.
const toDocUrl = (r) => {
  const s = String(r || '');
  const h = s.indexOf('#');
  if (h === -1) return s;
  const frag = s.slice(h + 1);
  return frag === '' || frag.startsWith('/') ? frag : s.replace(/^#/, '');
};
const toAppUrl = (r) => (HASH_ROUTES ? '#' + toDocUrl(r) : r);
const USER = val('user', '1'); const PASS = val('pass', '1');
// v2.9.4: generic entity-id hint for resolveParam (§6.1 fills :cid/:companyId/
// :company only) — NOT a login step. There is no post-login "select" action;
// for any other param name use --param name=value.
const COMPANY = val('company', null);
const DB_PATH = val('db-path', process.env.DB_PATH ?? null);
const BACKUP_DIR = val('backup-dir', 'plan/replay/db-backups');
const SKIP_BACKUP = has('skip-backup');
const RESET_URL = val('reset-url', null);
// v2.9.4: a reset route must look like a route — catches shell path-mangling
// and typos at load instead of a confusing goto failure mid-run.
if (RESET_URL != null && (!/^[#/~.]/.test(RESET_URL) || /[A-Za-z]:\//.test(RESET_URL))) { console.error(`✗ invalid --reset-url "${RESET_URL}" (expected an app route starting with / or #)`); process.exit(2); }
// v2.9.2: explicit, awkward-on-purpose escape hatch — see the §3 CRITICAL
// note. Without this (or --reset-url), main() refuses to run the sweep when
// backupDatabase() returned null, instead of silently proceeding unguarded.
const NO_ROLLBACK_ACK = has('i-accept-no-db-rollback');
const MODE = val('mode', 'both');
if (!['sweep', 'scripted', 'both'].includes(MODE)) { console.error(`✗ invalid --mode "${MODE}" (expected sweep | scripted | both)`); process.exitCode = 2; process.exit(2); }
const FROM = reqInt('from', 0, 0);
const UNTIL_ARG = val('until', null);   // resolve to UNTIL only after PARTS exists — see §3/§7
const MAX_CLICKS = reqInt('max-clicks', 2000, 1);
const ALLOW_DESTRUCTIVE = has('allow-destructive');
const EXCLUDES = list('exclude');
const DEEP_SELECTS = has('deep-selects');
const MONTH = val('month', new Date().toISOString().slice(0, 7));
const SHOT_DIR = val('shot-dir', null);
// v2.9.4: every --param token must be name=value (a bare name is a typo, not
// an empty override) — and generator-baked MANIFEST.params seeds the map, so
// a scan-time --param survives into the run (run-time --param wins on clash).
for (const t of list('param')) if (!t.includes('=')) { console.error(`✗ invalid --param "${t}" (expected name=value)`); process.exit(2); }
const PARAM_OVERRIDES = { ...(MANIFEST.params ?? {}), ...Object.fromEntries(list('param').map((s) => { const [k, ...v] = s.split('='); return [k, v.join('=')]; })) };
// v2.8.1 HUB_ROUTES: entity-hub pages whose links resolve dynamic params
// (§6.1 hub fallback). v2.9.2: neither A5 (navbar) nor A7 (select/dialog
// density) actually derives this — it is a static default plus the
// --hub-routes CLI override; per-app values must be set by hand (e.g.
// --hub-routes /companies,/home when the app's entity hub lives there)
// until/unless a future Phase A step scans for entity-hub pages for real.
const HUB_ROUTES = val('hub-routes', '/companies,/home').split(',').map((s) => s.trim()).filter(Boolean);
const MANAGE_DEV_SERVER = !has('no-manage-dev-server');   // default: script owns the dev server's lifecycle (see §4.7)
const DEV_CMD = val('dev-cmd', 'npm run dev');
const DEV_CWD = val('dev-cwd', '.');
const DEV_READY_PATH = val('dev-ready-path', '/');
const DEV_READY_TIMEOUT = reqInt('dev-ready-timeout', 30000, 1000);
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
  // v2.9.1 ELEMENT-ANCHORED DISPATCH (the v2.9 locator contract, final form):
  // the glide is purely a COSMETIC cursor animation. The actual input event
  // is anchored to the ELEMENT, not the coordinates: post-glide, the locator
  // is resolved into an ElementHandle (evaluateHandle — real Playwright API,
  // so this is the LAST-MOMENT snapshot of the true node) and the event
  // dispatches on THAT node. A re-render that parks an impostor under the
  // glided coordinates can never receive the click; if the true node
  // detached in the final ms, handle.click() THROWS (real ElementHandle
  // semantics) and the catch falls back to locator.click(), which lets
  // Playwright re-resolve the selector. If that also fails — the element is
  // genuinely gone — the throw propagates to probe(), and THAT throw is the
  // retry signal that drives resolveFresh's stale-tag recovery (v2.8.3).
  // v2.8.4's re-center check stays, demoted to cursor-accuracy duty: it
  // makes the recording glide to where the element IS, not where it was
  // when the batch was built.
  let c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  const c2 = await center(locator).catch(() => c);
  if (Math.abs(c2.x - c.x) > 4 || Math.abs(c2.y - c.y) > 4) {
    c = c2; await glide(page, c.x, c.y); await sleep(Math.min(P.settle, 150));
  }
  const handle = await locator.evaluateHandle((n) => n).catch(() => null);
  if (handle) { await handle.click({ timeout: 3000 }).catch(() => locator.click({ timeout: 3000 })); await sleep(P.post); return; }
  await locator.click({ timeout: 3000 }); await sleep(P.post);
};
const type = async (page, locator, text, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await locator.click({ timeout: 3000 });   // element-anchored focus (v2.9.1): focus the TRUE node first (never click at glided coordinates); keys/fill then land in that element
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text, { delay: P.typeDelay }); await sleep(P.post);
};
const fill = async (page, locator, value, label) => {
  const c = await center(locator); await glide(page, c.x, c.y); await sleep(P.settle);
  await locator.click({ timeout: 3000 });   // element-anchored focus (v2.9.1): focus the TRUE node first (never click at glided coordinates); keys/fill then land in that element
  await locator.fill(value); await sleep(P.post);
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
const teardown = async (browser, watchdogMs = 8000) => {
  if (!browser) return;
  // v2.9.4 WATCHDOG RACE: v2.9.3 awaited close() first and checked a flag
  // after — on a hung close() the await never settled, so the check was
  // unreachable and the script hung forever (the exact failure this exists
  // for); on a slow-but-successful close the flag had already fired and the
  // kill path misfired. Race instead: the script proceeds to kill+exit rather
  // than hanging, and a close() that rejects counts as closed (nothing live
  // left to kill). Promise.race does NOT cancel its loser — the timer is
  // still cleared on settle so a clean close exits immediately with no tail.
  let timer;
  const timeout = new Promise((res) => { timer = setTimeout(() => res('timeout'), watchdogMs); });
  let result = 'timeout';
  try { result = await Promise.race([browser.close().then(() => 'closed', () => 'closed'), timeout]); }
  finally { clearTimeout(timer); }
  if (result === 'timeout') {
    console.log(`      ⚠ teardown: browser.close() did not settle in ${watchdogMs}ms — killing orphaned Playwright browsers, forcing exit`);
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
  await page.goto(BASE_URL + toAppUrl(RESET_URL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  const submit = page.locator('form button[type="submit"], form button').first();
  // v2.9.4: cursor-visible like every other interaction — click() glides to the
  // true element first instead of firing an invisible raw locator click.
  await click(page, submit, 'reset submit').catch(() => {});
  await sleep(3000);
}

// §4.6 — DB snapshot/restore (v2.6: verify-before-restore, seconds-precision stamp)
// v2.9.3: dbKind (A6 manifest tag: 'sqlite-file' | 'remote' | 'unknown') is
// passed in by the §7 caller so the no-file warning below can tell a REMOTE
// database apart from a misconfigured --db-path — see the branch.
function backupDatabase(dbKind) {
  if (SKIP_BACKUP) { console.log('⚠ --skip-backup: no DB snapshot'); return null; }
  // v2.8: in --no-manage-dev-server mode the script CANNOT stop the
  // externally-owned server, so it cannot take a safe snapshot (the copy
  // would run on a live DB — the tear risk this section exists to prevent)
  // nor a safe restore. Skip both with an explicit warning instead of doing
  // the unsafe thing silently.
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: script cannot quiesce the DB (server externally owned) — backup/restore skipped; DB is NOT rolled back'); return null; }
  // v2.9.3 DBKIND-AWARE WARNING: 'remote' means the app's data lives in
  // Turso/libSQL, Postgres, MySQL, Mongo… — there IS no local file, so the
  // old 'file missing (null)' line was a LIE that sent the operator hunting
  // for a --db-path that cannot exist (the A6 scan found the remote client,
  // not a mis-typed flag). sqlite-file/unknown keep the honest path error.
  if (!DB_PATH || !existsSync(DB_PATH)) {
    if (dbKind === 'remote') {
      console.log('⚠ app DB is remote/non-file (Turso/libSQL, Postgres, MySQL, Mongo…) — there is no local file to snapshot; rollback relies on --reset-url or manual action outside this script');
    } else {
      console.log(`⚠ --db-path file missing (${DB_PATH}) — rollback relies on reset form`);
    }
    return null;
  }
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
  if (!MANAGE_DEV_SERVER) { console.log('⚠ --no-manage-dev-server: restart your dev server manually before continuing'); return true; }
  if (!devServerProc) return true;
  const proc = devServerProc;
  const pid = proc.pid;
  log('DEV-SERVER', `stopping pid ${pid}`);
  // Resolve on the child's REAL exit, not a guessed sleep. The old blind
  // sleep(800) raced Windows handle release: if npm/vite took >800ms to die,
  // restore() copied DB files while the server still held the -shm mmap —
  // exactly the corruption this section exists to prevent.
  const alive = () => proc.exitCode == null && proc.signalCode == null;
  const waitExit = (ms) => new Promise((resolve) => {
    if (!alive()) return resolve(true);
    const t = setTimeout(() => resolve(!alive()), ms);
    proc.once('exit', () => { clearTimeout(t); resolve(true); });
  });
  const killTree = (force) => {
    try {
      if (process.platform === 'win32') {
        // npm on Windows wraps the real node/vite process; a plain .kill() on
        // the npm.cmd pid often leaves the actual server — and its lock on
        // the DB's -shm file — running. /T kills the whole tree, /F forces it.
        execSync(`taskkill /pid ${pid} /T ${force ? '/F' : ''}`.trim(), { stdio: 'ignore' });
      } else {
        process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');   // negative pid = whole process group (spawned with detached:true above)
      }
    } catch (e) { console.log(`      ⚠ stopDevServer: ${e?.message ?? e}`); }
  };
  killTree(false);
  // v2.9.3: null our reference immediately so the spawn-time exit handler
  // stays quiet on the CONFIRMED path — and restore it when the process is
  // still alive, so startDevServer()'s `if (devServerProc) return;` guard
  // keeps a later start from double-spawning over the surviving server.
  devServerProc = null;
  if (!(await waitExit(5000))) {
    devServerProc = proc;
    console.log('      ⚠ dev server still alive after SIGTERM/taskkill — escalating to force-kill');
    killTree(true);
    if (!(await waitExit(5000))) {
      // v2.9.3 UNCONFIRMED-EXIT REFUSAL: an unconfirmed exit means the DB
      // handle may STILL be open. Never restore over it — return false so
      // every restoreDatabaseBackup() call site (§7) skips the copy and
      // prints a manual instruction instead of racing the very corruption
      // the bracket exists to prevent.
      console.error('      ✗ dev server pid ' + pid + ' did NOT exit after force-kill — DB file handles may still be held.\n' +
        '        SKIPPING DB restore (copying snapshot files over a live DB is what corrupts it).\n' +
        '        Stop the process manually, then restore from ' + BACKUP_DIR + '.');
      return false;
    }
  }
  await sleep(300);   // small settle AFTER real exit for OS handle bookkeeping
  console.log('      ✓ dev server stopped');
  return true;
}
// INVARIANT: restoreDatabaseBackup() is NEVER called on its own from main()
// (§7) — every call site does stopDevServer() → restoreDatabaseBackup(stamp)
// → startDevServer(), in that order, so the DB files are only ever touched
// while nothing has them open, and the app is always left running
// afterward. v2.9.3: restore is additionally gated on stopDevServer()
// returning TRUE — a server that survived force-kill still holds the DB
// open, and copying over it is exactly the corruption this section exists
// to prevent; the gate refuses and prints a manual-restore instruction.
// resetViaForm() (§4.5) needs the server UP to navigate, so it only ever
// runs AFTER startDevServer() has resolved.

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
// v2.9.2: nothing in Phase A actually scans the target codebase for
// destructive vocabulary — A7 (§1) only measures select/dialog/details
// density. Treat the list below as a FIXED, best-effort, English-only guard
// that catches common destructive verbs and NOTHING app-specific — a button
// labeled "Terminate", "Publish", "Send Invoice" or a domain jargon term
// will sail through untouched unless added here by hand after reading the
// app's own action/button labels. This list is a second, imperfect line of
// defense; the DB snapshot/restore bracket (§4.6/§4.7, gated in §7) is the
// actual safety mechanism — do not rely on wording alone to make a sweep
// safe against a database you can't roll back.
// v2.6: word-boundary anchored. The old substring regex skipped any control
// containing "avoid" (A|VOID) in its label — a false destructive skip.
// v2.9.2: widened beyond the original accounting-flavored list (void, purge,
// drop) to cover common SaaS/CRUD destructive verbs — trading a little sweep
// exhaustiveness for safety. Does not affect closeModal()'s dismiss-button
// matching, which is a separate literal-text code path.
// v2.9.4: bare `cancel` narrowed — a plain "Cancel" button only dismisses its
// dialog (closeModal's own literal path, always safe to click) and must stay
// sweepable; only "Cancel <thing>" (plan/subscription/…) destroys something.
const DESTRUCTIVE = /\b(void|delete|remove|drop|purge|reset|disable|log ?out|sign ?out|cancel[- ]?(plan|subscription|membership|order|booking|account|service|invoice)|terminate|suspend|ban|revoke|archive|deactivate|unsubscribe|discard|wipe|clear|empty|refund|charge|downgrade)\b/i;
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
  // v2.8.4 SCOPE-PRESERVING RECOVERY: the re-search MUST use the same root
  // census() would have used for this element's scope — recovery must never
  // become the back door that reintroduces the "clicked the button BEHIND
  // the modal" bug (a document-wide search would match a background control
  // that happens to share the selector + text of the modal child we lost).
  // Matching is EXACT-text (normalize whitespace only) — v2.8.3's substring
  // `includes` matched "Save Draft" while hunting for "Save".
  const rootSel = el.scope === 'modal' ? 'dialog[open], .modal-open'
    : el.scope === 'dropdown' ? DROPDOWN_SEL : null;
  const hit = await page.evaluate(({ sel, text, tid, title, aria, href, nextId, rootSel }) => {
    const root = rootSel ? document.querySelector(rootSel) : document;
    if (rootSel && !root) return null;          // scope closed/gone — genuinely gone
    const norm = (s) => (s ?? '').trim().replace(/\s+/g, ' ');
    for (const n of root.querySelectorAll(sel)) {
      if (n.getAttribute('data-replay-cid') != null) continue;   // never steal another element's tag
      if (tid && n.getAttribute('data-testid') !== tid) continue;
      if (href && n.getAttribute('href') !== href) continue;
      if (title && n.getAttribute('title') !== title) continue;
      if (aria && n.getAttribute('aria-label') !== aria) continue;
      if (text && norm(n.innerText) !== text) continue;          // EXACT normalized text
      if (!(tid || href || title || aria || text)) continue;     // no identity to match on
      const id = 'S' + nextId;
      n.setAttribute('data-replay-cid', id);
      return id;
    }
    return null;
  }, { sel: el.sel, text: el.text, tid: el.tid ?? null, title: el.title ?? null, aria: el.aria ?? null, href: el.href ?? null, nextId: CID_SEQ + 1, rootSel }).catch(() => null);
  if (!hit) return null;
  CID_SEQ++;
  return { ...el, cid: hit, loc: page.locator(`[data-replay-cid="${hit}"]`) };
};
const fingerprint = (page) => page.evaluate((hashRoutes) => ({
  // v2.9: hash-routed SPAs carry the route in the fragment (pathname is
  // constant '/'), so the hash IS part of the route identity there. Path-
  // routed apps keep the v2.7 shape — a bare '#anchor' scroll must not
  // count as navigation.
  url: location.pathname + location.search + (hashRoutes ? location.hash : ''),
  dlg: document.querySelectorAll('dialog[open], .modal-open').length,
  rows: document.querySelectorAll('tbody tr').length,
  open: document.querySelectorAll('details[open]').length,
  // v2.8 EXPANSION DETECTION: openVec catches exclusive <details name="group">
  // panels (opening one CLOSES its sibling — the total open count stays
  // equal, but the vector …110… → …101… moves); ariaExp catches hand-built
  // state-toggled accordions (a div + aria-expanded, no <details> at all).
  openVec: [...document.querySelectorAll('details')].map((d) => (d.open ? 1 : 0)).join(''),
  ariaExp: document.querySelectorAll('[aria-expanded="true"]').length,
}), HASH_ROUTES);
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
    // v2.8.4: selects resolve through resolveFresh too — this branch used to
    // run BEFORE it, so an orphaned select tag hit the pre-v2.8.3 failure
    // mode: el.loc.inputValue() with NO explicit timeout (the only such call
    // left in the file, violating the v2.4 rule) burned ~30s, then the run
    // silently reported select-enumerated (0 options).
    const selEl = await resolveFresh(page, el);
    if (!selEl) { rec.result = 'click-failed: select gone after re-render'; report.push(rec); return; }
    const loc = selEl.loc;
    const before = await loc.inputValue({ timeout: 1500 }).catch(() => null);
    if (before === null) { rec.result = 'click-failed: select unresolvable'; report.push(rec); return; }
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
    }, selEl.cid);
    if (DEEP_SELECTS) {
      for (const o of options) {
        if (o.value === before) continue;
        if (DESTRUCTIVE.test(`${o.label} ${o.value}`) && !ALLOW_DESTRUCTIVE) { console.log(`      ⚠ skip destructive option "${o.label}"`); continue; }
        await loc.selectOption(o.value, { timeout: 1500 }).catch(() => {}); await sleep(P.post);
      }
    }
    await loc.selectOption(before, { timeout: 1500 }).catch(() => {});
    rec.result = `select-enumerated (${options.length} options)`; report.push(rec); return;
  }
  // §8 promised "retry-once after settle on click failure" — v2.5 never
  // implemented it (click failed → recorded → gone). Retry exactly once.
  // v2.8.3: both attempts go through resolveFresh — a tag orphaned by a
  // non-navigating re-render recovers instantly instead of burning two
  // 3s timeouts and recording click-failed for a visible element.
  let clickErr = null;
  const fresh = await resolveFresh(page, el);
  // v2.9 BATCH-ABORT ON EVAPORATION: resolveFresh null means the element is
  // genuinely absent from its scope root. One gone element usually means a
  // state-changing click re-rendered the container (unkeyed {#each} lists,
  // collapsed expansion panels) and the REST of this census batch is dead
  // too — recording each remaining tag as click-failed produced 96 noise
  // records on one demo page while the sweep ground through them. Return
  // the same batch-abort signal the v2.7.1 stale-census path uses: the
  // caller re-censuses, dedup + fresh tags pick up whatever is really
  // there now. The record still notes the evaporation honestly.
  if (!fresh) { rec.result = 'click-failed: element gone after re-render (batch-abort)'; report.push(rec); return 'navigated'; }
  // v2.8.4: capture whichever locator ACTUALLY got clicked — recovery can
  // hand back a re-tagged element, and every post-click follow-up below
  // (modal-opener re-click, row collapse, details collapse) must drive the
  // SAME node the sweep interacted with, not the possibly-dead el.loc
  // (a silent no-op here strands legacy checkbox-hack modals whose only
  // close path is re-clicking the toggle).
  let clickedLoc = fresh.loc;
  try { await click(page, fresh.loc, 'sweep: ' + (el.text || el.sel)); }
  catch (e) {
    clickErr = e;
    await sleep(P.settle);
    const fresh2 = await resolveFresh(page, el);   // re-render may have happened between attempts
    if (fresh2) { try { await click(page, fresh2.loc, 'sweep retry: ' + (el.text || el.sel)); clickErr = null; clickedLoc = fresh2.loc; } catch (e2) { clickErr = e2; } }
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
    if ((await closeModal(page, clickedLoc)) === 'stuck') {
      // One unclosable modal must never trap the sweep. Dialog state is
      // client-side — a reload of the route clears it. Record + abort the
      // batch (tags may be stale after re-render); caller re-censuses.
      rec.result = 'modal-opened (modal-stuck-reload)'; report.push(rec);
      await page.goto(BASE_URL + toAppUrl(fp.url), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await settleHydration(page);
      return 'navigated';
    }
  } else if (el.sel.includes('tbody tr')) {
    const panel = clickedLoc.locator('xpath=following-sibling::tr[1]');
    if (await panel.isVisible().catch(() => false)) {
      rec.result = 'row-expanded';
      for (const child of await census(page)) { if ((await probe(page, child, depth + 1, report)) === 'navigated') return 'navigated'; }
      // Collapse it back by re-clicking the ROW — the same gesture that
      // expanded it. v2.5 clicked locator('button').first() here, which in a
      // row whose buttons are [Edit] [Delete] hits EDIT — an arbitrary action,
      // not a toggle (reproduced). The row was what we clicked to expand;
      // the row is what we click to collapse. Escape covers sticky panels.
      // v2.8.4: collapse drives clickedLoc — the row we ACTUALLY clicked.
      await clickedLoc.click({ timeout: 1500 }).catch(async () => { await page.keyboard.press('Escape').catch(() => {}); });
    }
  } else {
    const fp2 = await fingerprint(page);
    if (fp2.url !== fp.url) {
      rec.result = 'navigated → ' + fp2.url;
      // v2.9.4: queue route-shaped discoveries only — a bare '#anchor' scroll
      // on a hash app normalizes to 'section' (no leading slash); queuing it
      // would sweep BASE_URL + '#section' as if it were a route.
      const docUrl = toDocUrl(fp2.url);
      if (docUrl.startsWith('/') && !docUrl.startsWith('/login')) routeQueue.add(docUrl);
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
      if (toDocUrl(back.url) !== toDocUrl(fp.url)) await page.goto(BASE_URL + toAppUrl(fp.url), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
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
      // Escape doesn't close <details>. v2.8.4: drives clickedLoc.
      await clickedLoc.click({ timeout: 1500 }).catch(() => {});
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
    await page.goto(BASE_URL + toAppUrl(fp.url), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await settleHydration(page);
    return 'navigated';
  }
  report.push(rec);
}
async function sweepRoute(page, url, report) {
  PHASE = 'sweep goto ' + url;
  await page.goto(BASE_URL + toAppUrl(url), { waitUntil: 'domcontentloaded', timeout: 25000 });
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
  // v2.9.4: stuck/unclean reloads keep their own breakdown keys — folding them
  // into 'modal-opened'/'clicked' hid the modals that trapped the sweep.
  for (const r of report) {
    const key = r.result.includes('modal-stuck-reload') ? 'modal-stuck-reload'
      : r.result.includes('state-unclean-reload') ? 'state-unclean-reload'
      : r.result.split(' ')[0].split('→')[0].trim();
    byResult[key] = (byResult[key] ?? 0) + 1;
  }
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
resolveParam(route, cid): 1) PARAM_OVERRIDES[name] (run-time --param wins over
generator-baked MANIFEST.params); 2) --company for :cid/:companyId/:company;
3) live: goto nearest param-less prefix, read first a[href] matching the route
shape — if the prefix yields nothing (commonly a 404 or an index-less
section), retry the scan on each HUB_ROUTES page (§4.1: entity hubs like
/companies link to /<section>/:id routes);
else return null → the §7 seed logs `skipped-unresolvable` for the route
and does not queue it (an unresolvable route never runs, so it produces no
coverage record).
This MUST be implemented as an actual named function `resolveParam` — it is
now part of the --selftest wiring check (§7), so a generated script that
only describes this logic in a comment will fail --selftest instead of
silently shipping with unresolvable dynamic routes.

// §6.1 — resolveParam (embedded — copy verbatim; MANIFEST generated by Phase A)
// Resolve dynamic route params to concrete ids. Order: explicit --param
// override (run-time --param wins over generator-baked MANIFEST.params) →
// --company id for :cid/:companyId/:company params → live discovery (visit
// the nearest
// param-less prefix and read the first in-app link whose href matches the
// route's shape). Returns the filled route path, or null when unresolvable
// (the §7 seed logs 'skipped-unresolvable' and does not queue the route).
// v2.9.3 SHARED HREF SCANNER (used by the prefix scan and the hub fallback):
// visit the current page and return the first in-app href that extends the
// route prefix with at least one concrete segment. Hash-SPA links carry the
// route in the fragment ('#/docs/7/view/3') — strip the leading '#/' when
// HASH_ROUTES so discovery works there too; path apps' '/x' hrefs pass
// through untouched and a bare '#anchor' is never a route (still excluded).
const scanRouteHrefs = async (page, prefix) => {
  const href = await page.evaluate((arg) => {
    const pref = arg.prefix;
    const esc = pref.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp('^' + esc + '/[^/]+(/.*)?$');
    for (const a of document.querySelectorAll('a[href]')) {
      let h = a.getAttribute('href') ?? '';
      if (arg.hashRoutes && h.startsWith('#/')) h = h.slice(1);   // hash-SPA link → route string
      if (h.startsWith('/') && !h.startsWith('//') && re.test(h)) return h;
    }
    return null;
  }, { prefix, hashRoutes: HASH_ROUTES }).catch(() => null);
  return href;
};
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
    await page.goto(BASE_URL + toAppUrl(prefix === '/' ? '' : prefix), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await settleHydration(page);
    // href must extend the prefix with at least one concrete segment:
    // prefix '/invoices' + shape ':id(/edit)' matches '/invoices/42' or
    // '/invoices/42/edit' — never '/invoices' itself.
    const href = await scanRouteHrefs(page, prefix);
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
        await page.goto(BASE_URL + toAppUrl(hub), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await settleHydration(page);
        href2 = await scanRouteHrefs(page, prefix);
        if (href2) break;
      }
    }
    if (!href2) return null;
    // v2.9.3 POSITIONAL FILL (fix): pushing every concrete tail segment of
    // the matched href, then letting the loop append the route's later
    // static parts, DOUBLE-PUSHED them — a link '/invoices/42/edit' resolving
    // '/invoices/:id/edit' produced '/invoices/42/edit/edit', and interleaved
    // statics ('/docs/:a/view/:b' from an exact '/docs/7/view/3' link)
    // misaligned the walk and returned null. Walk the href tail positionally
    // against the route's remaining parts: each segment lands in `out` and
    // every static part must EQUAL its tail segment — a shorter href
    // ('/invoices/42' for '/invoices/:id/edit') ends the walk early and the
    // loop below appends the trailing statics; a mismatch means the link is
    // a different route ('/invoices/42/print'), so return null rather than
    // fabricate a URL under this route's label.
    const tail = href2.split('/').filter(Boolean).slice(out.length);
    let ti = 0;
    for (let j = idx; j < parts.length && ti < tail.length; j++) {
      const seg = tail[ti];
      if (!parts[j].startsWith(':') && seg !== parts[j]) return null;   // shape mismatch — not this route
      out.push(seg);
      ti++;
    }
    if (ti < tail.length) return null;         // leftover concrete segments — not this route
    idx += ti - 1;                             // skip the parts the walk already consumed
  }
  return '/' + out.join('/');
}

concreteRoutes = every static (param-less) manifest route, plus every dynamic
route for which resolveParam() returned a non-null id for each of its params.
Warm-up pass BEFORE the crawl (kills cold-SSR compile stalls):
  for (const r of concreteRoutes.slice(0, 60)) { PHASE = 'warm ' + r;
    await page.goto(BASE_URL + toAppUrl(r), { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    console.log('      [warm] ' + r); }

===============================================================================
7. main() PLUMBING
===============================================================================
- Immediately after the PARTS array (empty by default) is declared:
    if (UNTIL_ARG != null && !Number.isFinite(parseInt(UNTIL_ARG, 10))) { console.error('✗ invalid --until "' + UNTIL_ARG + '" (expected a number)'); process.exit(2); }
    const UNTIL = UNTIL_ARG != null ? parseInt(UNTIL_ARG, 10) : PARTS.length;
  (See §3 CRITICAL note — never slice with UNTIL_ARG directly. Absent means
  all parts; `0` is honored ("run none"). v2.9.3's `|| PARTS.length` turned
  `--until 0` into "run all" and masked non-numeric typos as defaults.)
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
  existing as an unused overlay; v2.9.1: ALSO assert click.toString()
  contains 'evaluateHandle' — the element-anchored dispatch contract (the
  real input event resolves the target node at the last possible moment
  instead of clicking glided-at coordinates) is a load-bearing guarantee,
  not an implementation detail; BEHAVIORAL assertions (v2.6 — source
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
  seconds-precision stamp; v2.9.3: AND 'dbKind' — proves the kind-aware
  no-file warning (remote ≠ misleading 'file missing (null)') lives in the
  function, not just in prose; v2.9.2: assert main.toString() (or the module
  source, if main isn't independently stringifiable) contains
  'i-accept-no-db-rollback' — proves the no-rollback gate is wired into the
  actual run path, not just described in a comment; v2.9.3: AND 'runIsInert'
  — proves the scripted-mode exemption is real code, same rigor as every
  other safety-critical property checked here; v2.9.4: assert
  teardown.toString() contains 'Promise.race' — proves the close-watchdog is
  a real race, not a post-await flag check; AND NOT DESTRUCTIVE.test('Cancel')
  — proves a bare Cancel button stays sweepable (only "Cancel <thing>" is
  destructive); print PASS/FAIL;
  process.exitCode = missing.length ? 1 : 0; return WITHOUT launching a
  browser.
- v2.8 BACKUP BRACKET + v2.9.3 QUIESCE GATE (safety-critical ordering — do
  NOT "optimize" away): stopDevServer() returns true ONLY when the child's
  exit was CONFIRMED (it escalates SIGTERM → SIGKILL / second taskkill /F
  first, §4.7). The bracket aborts BEFORE the sweep when quiesce fails —
  sweeping with no snapshot means mutations with no way back:
    await startDevServer();
    const quiesced = await stopDevServer();
    if (!quiesced) { console.error('✗ cannot quiesce the dev server — ABORTING before any sweep (no safe snapshot)'); process.exit(1); }
  const dbKind = MANIFEST.db?.kind ?? 'unknown';   // v2.9.3: hoisted BEFORE the backup so backupDatabase() prints the dbKind-aware warning
  const stamp = backupDatabase(dbKind);
    await startDevServer();
  The FIRST startDevServer() is the §4.7 port preflight: it aborts the run
  if a server this script does not own already occupies BASE_URL, so the
  bracket below can never be voided by a stale external process. It also
  proves the dev command CAN start before we depend on it. stopDevServer()
  then quiesces (releasing the .db/-wal/-shm handles) for the copy.
  backupDatabase() does three SEPARATE copyFileSync calls on the live
  .db/-wal/-shm files. With the server still running, a write landing
  mid-copy yields a torn snapshot — the exact unsynchronized multi-file copy
  of an open DB that §4.6's whole design exists to prevent on restore. The
  snapshot must capture a quiescent DB: server STOPPED during the copy,
  restarted after. The final startDevServer() brings the app up before the
  browser launches, so login/sweep still see a reachable app. (Do not
  "simplify" the first start/stop pair away: without the preflight-then-
  quiesce sequence, a stale external server satisfies the bracket's own
  readiness checks while still holding the DB.)
- v2.9.2 NO-ROLLBACK GATE (immediately after the bracket above, BEFORE
  chromium.launch(); v2.9.3: message branches on MANIFEST.db.kind so a
  remote/non-file DB gets a specific warning instead of the generic
  'file missing' wording, and runIsInert exempts authored-only scripted
  runs — see the scope note after the snippet):
    const runIsInert = MODE_RUN === 'scripted';   // v2.9.3: authored PARTS-only run — never drains the route queue (§ MODE below)
    if (!runIsInert && !stamp && !RESET_URL && !NO_ROLLBACK_ACK) {
      console.error('✗ ABORT: no DB snapshot could be taken (' +
        (dbKind === 'remote' ? "the app's database is remote/non-file (Turso/libSQL, Postgres, MySQL, Mongo…) — there is no local file to snapshot"
          : dbKind === 'sqlite-file' ? 'the local SQLite file backup failed, was skipped, or the file is missing'
          : 'no local SQLite file was found (--db-path)') +
        ') and no --reset-url was given. The sweep is about to submit forms ' +
        'and fire every +page.server.ts action it finds, with no automatic ' +
        'way to undo it. Either point --db-path at the local SQLite file the ' +
        'dev server actually uses, pass --reset-url to a route that restores ' +
        'known-good data, run this against a disposable copy/branch of the ' +
        'database instead of one you care about, or pass ' +
        '--i-accept-no-db-rollback to proceed anyway.');
      process.exitCode = 1; process.exit(1);
    }
  Placed AFTER the bracket's own final startDevServer(), never before —
  aborting here still leaves the dev server running for the user (the
  invariant §8 states for every other exit path), only the browser/sweep is
  withheld. `stamp` alone is not sufficient to gate on: `!stamp` is also true
  right after a successful `--skip-backup` run, which is why RESET_URL and
  NO_ROLLBACK_ACK are both checked too — an explicit skip is not the same as
  an explicit "I accept the run is unrecoverable."
- v2.9.3 GATE-SCOPE (runIsInert, the ONLY exemption): MODE routing is what
  makes it sound — a `--mode scripted` run never drains the route queue, so
  the only things it fires are the PARTS the operator hand-wrote (plus
  login); the exhaustive-sweep rationale ('submit forms and fire every
  action it finds') simply does not apply, and forcing
  --i-accept-no-db-rollback onto a hand-authored recording on a remote-DB
  app (the demo-recording use case) was over-blocking. `--mode sweep` and
  `--mode both` always drain the queue and are NOT exempt, and neither is a
  logged-out SPA public-surface sweep: public pages routinely carry signup /
  contact / newsletter forms whose POSTs mutate a remote DB with no local
  file to snapshot — exactly the no-rollback case this gate exists for. If
  you want a public sweep against live data, pass --i-accept-no-db-rollback
  or --reset-url, or point the run at a disposable copy of the data.
- process.on('SIGINT', () => {
    // try/catch/finally: v2.5 had none — a stopDevServer() throw skipped the
    // restore AND skipped the exit, leaving a hung process with a mutated DB.
    // v2.9.3: restore runs ONLY when stopDevServer() confirmed the exit.
    (async () => {
      try {
        const quiesced = await stopDevServer();
        if (quiesced) restoreDatabaseBackup(stamp);
        await startDevServer();
      }
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
  it happens before the main sweep) — SKIPPED ENTIRELY when MANIFEST.login
  is null or --no-login was passed (v2.9; SPA apps with no login flow, or
  deliberate logged-out sweeps).
- MODE routing — v2.9.3 FIX: the emitted main() previously drained the
  route queue in EVERY mode, so `--mode scripted` fired the whole exhaustive
  sweep behind the operator's back (contradicting this bullet) and the
  no-rollback gate blocked authored recordings that would never sweep.
  main() now gates the warm-up + drain on MODE !== 'scripted':
  MODE sweep/both → warm-up + drain. The queue is seeded from EVERY MANIFEST
  route — static ones as-is, dynamic ones filled via resolveParam
  (unresolvable ones are logged skipped-unresolvable and not queued) — then
  capped at 60. Each queued route is visited TWICE: once in the warm-up pass
  (goto + `[warm]` log, pre-triggering the cold SSR compile) and once by
  sweepRoute(), whose in-page census/probe recursion reaches everything on
  that route (NAV_TREE destinations, entity-hub cards, revealed children —
  every +page.svelte is a manifest route, so the queue is the complete route
  surface). A sweepRoute failure is recorded route-failed and the run
  continues.
  MODE scripted/both → PARTS.slice(FROM, UNTIL). A pure `--mode scripted`
  run therefore executes ONLY the hand-authored PARTS (plus login) — which
  is exactly why the no-rollback gate exempts it via runIsInert (above).
- END: writeCoverage(report); const stopped = await stopDevServer(); const
  restored = stopped && restoreDatabaseBackup(stamp); await
  startDevServer(); rollback = restored || (await resetViaForm(page)) ||
  manual hint. SAME in catch — both gate restore on the confirmed stop
  (v2.9.3: never copy snapshot files over a server that survived
  force-kill). Print stack
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
- <select>: selectOption only — never a raw mouse click on the dropdown
  list. probe() reads the select's current value via inputValue (1500ms
  timeout), with --deep-selects cycles every OTHER option through
  selectOption (each option label/value passes the DESTRUCTIVE guard first),
  then restores the original value. The hand-written pickSelect helpers
  focus+selectOption for the same reason. Expand-vs-toggle is detected by
  COMPARING pre-click vs post-click state, not by peeking at details.open:
  a details[open]-count increase, an equal-count vector change (exclusive
  <details name="group"> swaps a sibling closed), or an aria-expanded=true
  count increase (state-toggled accordion divs) all recurse into the
  revealed children at depth+1, then re-click the same toggle to collapse.
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
  corrupt DB. v2.9.3: restore is additionally gated on stopDevServer()
  returning true — if the server survives force-kill, the restore is
  refused with a manual instruction rather than run over a still-open
  handle. `--no-manage-dev-server` trades this automatic safety for a
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
- Destructive guard; void-not-delete; native dialogs auto-dismissed and
  popups auto-closed by wirePageGuards() (§4.3, wired in §7 main()).
  (Endpoint downloads are NOT auto-fetched by the sweep — see §1 A3.)
- coverage.md's Failed/skipped section lists every click-failed and
  skipped-destructive record as `route | selector | text | result`. Other
  result kinds (route-failed, navigated, modal-opened, row-expanded,
  details-expanded, select-enumerated, …) are NOT in that markdown list —
  they live in coverage.json's records array, and writeCoverage's byResult
  breakdown in both files covers every result kind.
- Element-anchored dispatch (v2.9.1): the gliding cursor is COSMETIC. For
  CLICK, the input event is anchored to the ELEMENT — post-glide the locator
  is resolved into a handle at the last possible moment (locator.evaluateHandle
  → handle.click; locator.click is the fallback when no handle resolves) —
  never dispatched at glided-at coordinates. type()/fill() anchor the same
  way through their FIRST action, locator.click() to focus the true element
  (then keyboard.type / locator.fill) — they never mouse at coordinates
  either. A re-render parking an impostor under the cursor cannot receive
  the event; if the resolved node detached, handle.click() throws and the
  locator.click() fallback re-resolves — and when the element is genuinely
  gone, that throw is probe()'s retry signal, which drives resolveFresh's
  stale-tag recovery. Do not "simplify" this back to page.mouse.click(x, y):
  it silently re-opens the coordinate TOCTOU race.
- Runbook: node --check → --selftest → 20-click headless smoke → headed
  recording (--normal) with `2>&1 | tee plan/replay/run.log`.
- Failure: per-route sweep errors are caught and recorded `route-failed`
  and the queue drain CONTINUES (one bad route never stops the run). Errors
  in login (after 3 attempts) or a hand-authored PARTS step are
  UNRECOVERABLE — the FATAL path rolls back snapshot-first (gated on a
  confirmed stop), restarts the dev server, writes the partial coverage
  report and exits 1. A click-budget hit stops the drain early but still
  runs the normal END (rollback + coverage) and exits 0.
