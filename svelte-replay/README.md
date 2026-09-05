# svelte-replay

Self-contained, zero-dependency generator of recorded, cursor-visible
**Playwright replay scripts for any Svelte or SvelteKit app**. It scans a
codebase from scratch (routes, server actions, endpoints, login form,
navbar, SQLite DB file), emits **one** Node ESM script that exhaustively
sweeps every route, button, link, tab, dropdown, modal, select, checkbox and
expandable row — with a gliding in-page cursor overlay for demo recordings,
a Windows-safe DB snapshot/restore safety net, heartbeat liveness logging,
and a coverage report. All outputs live under the target app's `plan/replay/`.

**What's in this repo:**

| Item | Role |
|---|---|
| `SKILL.md` | The skill itself. Everything the generated script needs is embedded in its §4–§6 blocks; the doc is the single source of truth. |
| `scripts/generate.mjs` | The reusable generator: scans a target app (Phase A) and emits `plan/replay/manifest.json` + `plan/replay/replay-all.mjs` (Phase B). No per-app hand-written code. |
| `test/` | `node --test` regression harness. The extractor carves the §4–§6 blocks out of SKILL.md **verbatim** and runs them against a JSDOM-mocked Playwright page — any edit that changes embedded-code behavior fails here at test time. |
| `package.json` | Harness runner (`npm test`) + `npm run generate` wrapper. One dev dependency: `jsdom`. |

The target app needs exactly one dependency from you: `playwright`
(browsers: `npx playwright install chromium` once per machine).

---

## Quick start (any Svelte/SvelteKit app)

```bash
# 1. Generate the manifest + replay script (run FROM your app's root)
node <path-to-this-repo>/scripts/generate.mjs \
  --base-url http://localhost:5173 \
  --user you@example.com --pass <secret>

# 2. Run the three gates, in order, BEFORE any real run:
node --check plan/replay/replay-all.mjs                       # syntax
node plan/replay/replay-all.mjs --selftest                    # wiring, no browser/app
node plan/replay/replay-all.mjs --headless --mode sweep \
  --max-clicks 20 --user you@example.com --pass <secret>      # real-scenario smoke

# 3. Only after all three pass — the full sweep (fast pace, visible browser):
node plan/replay/replay-all.mjs --dev-cmd "npm run dev" \
  --user you@example.com --pass <secret> 2>&1 | tee plan/replay/run.log

# For a screen-recorded demo, slow the cursor down:
#   add --normal
```

The generator prints the exact gate commands for your app (including
`--db-path` when it detects a SQLite file and a `--user/--pass` reminder when
it found a login form).

### What the generator discovers vs. what you pass

**Discovered automatically (Phase A scan):**
- Routes — SvelteKit: `src/routes/**/+page.svelte` incl. dynamic `[param]`
  segments, with route groups (`(app)`), param matchers (`[id=integer]`)
  and optional params (`[[p]]`, swept in both forms) converted to real
  URLs. Plain SPAs: route-table entries, router API calls
  (`navigate`/`replace`/`goto`), and hash hrefs mined from
  `src/**/*.svelte|js|ts`
- Login form — input ids/names/types + submit button (fallbacks exist)
- DB path — sqlite/db-path patterns in source (src **and** root-level
  server/entry files), plus a best-effort `dbKind` (`sqlite-file` |
  `remote` | `unknown`) so the sweep knows whether a file snapshot is even
  possible
- Server actions/endpoints (SvelteKit), navbar tree (best effort)

**Passed as flags:**
- (No target-dir flag: run the generator FROM the app's root — cwd is the
  target, so `cd <app>` first. Unknown flags and stray positional args are
  HARD ERRORS (exit 2) in both the generator and the emitted replay script —
  a stale `--project` (or the never-implemented `--nav-tree-legacy`) is
  rejected with a named message instead of silently testing the wrong
  thing.)
- `--base-url <url>` — where the app serves (default `http://localhost:5173`)
- The generator prints the detected `dbKind` at scan time (`⚠ db: REMOTE` /
  `⚠ db: UNKNOWN` are flagged loudly) and bakes a `// DB: …` header line
  into the emitted replay-all.mjs, so a non-file-DB app is obvious before
  the first run.
- `--user <value>` / `--pass <value>` — login credentials
- `--mode sweep|scripted|both` (default `both`; `scripted` runs recorded
  PARTS steps, which are empty unless you add them)
- `--max-clicks N` (default 2000), `--headless`, `--normal` (slow demo pacing)
- `--dev-cmd CMD` (default `npm run dev`), `--dev-cwd DIR`,
  `--dev-ready-path PATH`, `--dev-ready-timeout N`
- `--db-path FILE` — override the detected SQLite file
- `--param name=value` (repeatable) — pin dynamic-route params the scan can't
  resolve from hub links (e.g. `--param company_id=ZENE14S6J5`)
- `--hub-routes /a,/b` — extra pages to scan for dynamic-route links
  (default `/companies,/home`)
- `--exclude TEXT` (repeatable) — skip elements matching TEXT
- `--allow-destructive` — permit delete/logout-shaped controls (default: off,
  they're recorded as `skipped-destructive`)
- `--skip-backup`, `--backup-dir DIR`, `--reset-url /route`,
  `--i-accept-no-db-rollback` — DB safety knobs (see below)
- `--help` — prints every flag with a one-line description plus the three
  gates, exits 0 (both binaries: the replay help is generated from the same
  FLAG_HELP table the strict validator reads)
- `--deep-selects`, `--month YYYY-MM`, `--shot-dir DIR` — coverage extras

**SPA-specific flags** (see the hash-SPA section below):
- `--routes /a,/b/:id` — explicit route list overriding/completing the scan
- `--no-login` — force-skip the login phase even if a form was found
- `--hash-routes` — the app is a hash-routed SPA
- `--after-login /route` — post-login redirect target (default `/home`)

---

## The three gates — why each exists

1. **`node --check`** — syntax. The script is ~1100 generated lines; catch a
   generation bug in seconds instead of mid-sweep.
2. **`--selftest`** — wiring, no browser/app launch. Asserts every helper
   exists and that load-bearing behaviors are actually present in the emitted
   code: the cursor tracks every interaction (`glide(` in each helper), the
   click dispatch is element-anchored (`evaluateHandle`), census tags are
   unique and scope-aware (`data-replay-cid`, `cidBase`, `scope`), the modal
   scoping is real, and the dev-server/backup functions exist.
3. **20-click headless smoke** — the only gate that exercises the real app.
   Catches app-side surprises (login shape, unexpected routes, a server that
   needs different flags) while the blast radius is 20 clicks and the DB
   snapshot/restore bracket is verified end-to-end.

Then, and only then, the full run. Budget hit → partial report with exit 0;
unrecoverable error → stack trace + rollback + exit 1.

## Dev-server ownership & the DB safety net

By default the script **owns the dev server**: it starts it
(`--dev-cmd`, default `npm run dev`), port-preflights (loudly refusing to run
if some *other* server already occupies the port — a stale detached vite
silently validating against a DB you're about to snapshot is the failure mode
this prevents), and brackets every DB snapshot **and** restore with
`stopDevServer() → copy → startDevServer()`. On Windows, copying `.db`/`-wal`
files under a process that holds them open can corrupt the database; the
bracket guarantees the files are only ever touched quiescent.

If something else owns the server (CI service container, your own terminal),
pass `--no-manage-dev-server` — the script then can't quiesce the DB and
**skips backup/restore with a printed warning** instead of pretending.

Rollback order at exit (normal, error, or Ctrl-C): restore the DB snapshot →
restart the server. Two hard guarantees back this up:

- **No snapshot, no sweep.** If `backupDatabase()` could not take a snapshot
  (remote/non-file DB such as Turso/libSQL, Postgres, MySQL or Mongo;
  `--skip-backup`; `--no-manage-dev-server`; a missing file) and no
  `--reset-url` was given, the script ABORTS before launching the browser
  unless you pass `--i-accept-no-db-rollback` (deliberately awkward to
  type). The dev server stays up either way — only the sweep is withheld.
  The abort message names the detected `dbKind`, so a Turso app gets
  "your database can't be file-snapshotted — point BASE_URL at a disposable
  copy/branch" instead of a generic missing-file warning (and
  `backupDatabase()` itself prints the same kind-aware warning at snapshot
  time rather than a misleading "file missing (null)"). One deliberate
  exemption: `--mode scripted` runs execute only the hand-authored PARTS
  (they never drain the route queue), so no snapshot/ack is demanded of an
  authored recording; sweep/both runs — including logged-out SPA
  public-surface sweeps, whose public forms mutate remote data — always
  need the snapshot, a `--reset-url`, or the flag.
- **Restore only on a confirmed stop.** `stopDevServer()` escalates
  (SIGKILL / a second `taskkill /T /F`) and returns `false` only if the
  dev server is STILL alive. Every `restoreDatabaseBackup()` call (end of
  run, catch, SIGINT) is gated on that result — the snapshot files are
  never copied over a server that may still hold the DB open (the `-shm`
  corruption scenario), and if that ever happens the script refuses the
  restore with a manual instruction instead.

If no snapshot exists (acknowledged or via `--reset-url`), rollback falls
back to the `--reset-url` form POST, then a manual hint. `SIGINT` always
restores.

## Hash-SPA caveats (plain Svelte SPAs, svelte-spa-router, etc.)

A hash-routed SPA keeps the document URL path fixed (often `/`) and carries
the route in the fragment (`http://host:port/#/tasks`). Consequences,
handled by `--hash-routes`:

- **Navigation**: every app-level `page.goto` goes through `toAppUrl()`,
  which prefixes `#`. Without the flag the script would hit 404 paths. The
  flag is baked into the generated script at scan time — one less thing to
  pass at run time. Route strings derived from the document URL (e.g.
  `'/#/tasks'`) are normalized to the fragment content (`'/tasks'`) before
  being queued or re-navigated, so discovered routes and post-navigation
  reloads never get a doubled `#` (`'#/#/tasks'` would render nothing).
- **Navigation detection**: `fingerprint()` route identity includes the
  fragment only when `--hash-routes` (otherwise a pathname comparison could
  never see a hash-route change, and a bare `#anchor` scroll would falsely
  count as navigation on path apps).
- **Login verification**: the post-login check compares *route keys*
  (fragment for hash apps, pathname+search for path apps) via a polling loop
  — `host#/` and `host/#/` are the same location but different strings, and
  `waitForURL` alone misses redirects that land during the click's trailing
  settle.

**Windows Git Bash (MSYS2) warning:** leading-slash CLI arguments get
rewritten into Windows paths — `--after-login /` silently arrives as
`C:/Program Files/Git/` (and even `#/` gets mangled to `#C:/Program
Files/Git/`). The generator refuses drive-letter-shaped route values loudly.
Pass `MSYS_NO_PATHCONV=1` before the command to disable the rewriting:

```bash
MSYS_NO_PATHCONV=1 node scripts/generate.mjs --hash-routes \
  --after-login "#/" --base-url http://localhost:5199
```

**Non-hash SPAs** (History-API routing, e.g. via `svelte-routing` or manual
`pushState`): no flags needed — the document path changes like SvelteKit, so
the default path-app behavior is already correct.

**Honest boundary:** Phase A is Svelte/SvelteKit-shaped (`+page.svelte`
conventions, Svelte component files). Other frameworks would need the scan
extended; the sweep engine itself is framework-agnostic.

## How the sweep stays safe

- **Modal scoping** — when `dialog[open]`/`.modal-open` matches, census and
  probes operate ONLY inside the modal; page buttons behind it are invisible
  until it closes. Recovery searches respect the same scope.
- **Element-anchored dispatch** — the gliding cursor is cosmetic; the real
  event resolves the target node at the last possible moment
  (`evaluateHandle` → `handle.click`). An impostor parked at the glided
  coordinates by a re-render can never receive the click.
- **Stale-tag recovery** — a census tag orphaned by a re-render is re-found
  by semantic identity (exact normalized text + testid/title/aria/href)
  within the element's scope, re-tagged with an id that can't collide. One
  evaporated element aborts the whole census batch for a fresh re-census
  instead of grinding through dead tags.
- **Destructive guard** — a fixed, English-only word list of destructive
  verbs (delete/void/purge/clear/archive/cancel/terminate/… — text, title,
  aria-label, and select options) is recorded `skipped-destructive` and
  never clicked unless `--allow-destructive`. It's a best-effort second
  line of defense; the DB snapshot/restore bracket is the actual safety
  mechanism.
- **Modal close ladder** — dismiss-worded buttons → Escape → re-click the
  opener; never auto-clicks OK/Yes/Confirm (that could EXECUTE the unknown
  thing being confirmed). Unclosable modal → honest `modal-stuck-reload`
  record + route reload.

## Development (this repo)

```bash
npm install        # one dev dep: jsdom
npm test           # 80 behavioral regression tests, no browser needed
```

The test harness extracts the §4–§6 embedded blocks from SKILL.md **verbatim**
each run — so SKILL.md prose drift *is* code drift and fails the suite. If
you move section boundaries in SKILL.md, update the marker lines in
`test/extract-embedded.mjs` (it tells you which marker went missing).

Three tests go a level deeper than source checks: `test/generate-fixture.test.mjs`
runs the real generator on throwaway SvelteKit fixtures (route groups, Turso
remote DBs, strict-CLI rejection, generator `--help`/usage parity);
`test/mode-gate.test.mjs` DRIVES the generated replay-all.mjs as a subprocess
against a stub page that records every `page.goto` — proving `--mode scripted`
makes zero route sweeps while `--mode both` warms and drains every route, and
driving the same main() through `--mode sweep` plus `PARTS --from/--until`
slicing, with no browser or dev server needed; and `test/doc-parity.test.mjs`
machine-checks SKILL.md §3's replay/generator/both-surfaces flag lists against
the FLAG_HELP and GEN_FLAG_ARITY tables that implement them.
`test/coverage-e2e.test.mjs` goes one step further: it drives the emitted
replay-all.mjs against a REAL JSDOM-backed page stub, then asserts the
coverage.json records and coverage.md Failed/skipped list match the §8
artifact contract exactly.

Everything in this repo and in target apps' `plan/replay/` is
generated-artifact friendly: add `plan/replay/` to the target app's
`.gitignore`.
