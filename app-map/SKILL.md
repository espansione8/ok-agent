---
name: app-map
description: Universal application mapping. Use to map ANY project codebase into a self-contained map.html + spec.json — routes, components, DB schema, business logic, integrations, env vars — regardless of stack.
category: engineering
---
# app-map

> **🚫 HARD GATE — READ FIRST. Violating this gate voids the skill.**
>
> **Before writing any file, you MUST:**
> 1. Read this ENTIRE skill file top to bottom. Every file output must already reflect the conventions below. This is not a guideline. It is a hard stop.

> **🔒 SECRETS GATE — applies to every output below**
> - `spec.json` and `map.html` are committed/shared artifacts — anything written into them travels with every copy of the file.
> - NEVER copy a literal secret value into either file: hardcoded shared URL secrets, API keys, passwords, preview passwords, tokens, SMTP credentials, connection strings — and never the VALUES from a real `.env` (names and descriptions only).
> - When a route or lib authenticates via a hardcoded secret, describe the mechanism and the file location, but redact the value. Wording pattern: "The [id] path segment is a hardcoded shared secret (value redacted — see src/routes/api/report/[id]/+server.ts; must be rotated and moved to env)."
> - Log every hardcoded secret you discover under `businessLogic.security_notes` so the next agent knows it must be rotated and externalized.
> - **Two files, one fact set:** `spec.json` and `map.html` carry the same descriptions. Any redaction applied to one MUST be applied to the other in the same change — a secret patched out of `spec.json` while `map.html` still displays it is exactly the leak this gate exists to prevent.
> - When filling route cards, copy the already-redacted description from `spec.json` verbatim — NEVER re-read the source file and paste the raw value into a `data-desc`/`.desc`.

Map any project codebase into a single self-contained `map.html` page and a `spec.json` data file. The output gives the next AI agent full application context — routes, components, database schema, business logic, integrations, env vars — without re-scanning the codebase. `spec.json` must stand alone: a future agent can understand the app's structure and logic, and make a correct change or debug an issue, from `spec.json` alone.

## Use this skill when
- The user asks to "map this project", "create an app structure map", "generate project documentation as HTML", or calls this skill
- Preserving codebase context for a future agent session
- `.plan/spec.json` needs a small patch after a code change → **Incremental update mode** below

## Incremental update mode
If `.plan/spec.json` already exists and this skill is invoked only to reflect a small code change (e.g. called by the `coding-standards` skill after a todo item changes something `spec.json` tracks):
- Do **NOT** re-run the 9-step scan or regenerate `map.html`.
- Read the existing `spec.json`; patch only the keys the change affects (e.g. one `routes[]` entry, one column in `database.tables[]`, one env var).
- Bump `generatedAt` to today's date.
- Leave `map.html` untouched unless the user explicitly asks to regenerate the visual map — **EXCEPTION: security fixes. If the patch redacts a secret and `map.html` contains that secret, apply the same redaction to `map.html` in the same change (SECRETS GATE → two files, one fact set).**

Run the full 9-step analysis only when `.plan/spec.json` doesn't exist, or the user explicitly asks to re-map the whole project.

## Analysis steps
Before writing any output, scan the codebase thoroughly — parallel file-picker and code-searcher agents; read key files to understand behavior, not just signatures. Each step feeds a specific part of `spec.json` (mapping listed per step). File patterns in the steps are examples across common stacks — identify the project's actual conventions from its manifest/config first, then scan accordingly.

### 1. Project identity
- Read `package.json` / `Cargo.toml` / `requirements.txt` / `build.gradle` / `go.mod` / `composer.json` for name, version, scripts, dependencies
- Identify framework, styling, database, auth, third-party integrations; project description from README or manifest
- → `spec.json`: `project`, `name`, `description`, `version`, `techStack`, `stackItems`

### 2. Routes & pages
- Find every route/page file — whatever shape the framework uses, e.g. SvelteKit `+page.svelte` / `+page.server.ts` / `+server.ts` / `+layout.svelte`; Next.js `app/**/page.tsx` / `route.ts` or `pages/**`; Nuxt `pages/**`; Rails/Django/Laravel router + controller files
- Per route: path, layout group, HTTP methods, auth guards, role restrictions
- Map navigation flow: redirects, which routes link to which; layout groups, middleware/guards, public vs. protected sections
- If a route is protected by a hardcoded shared secret (e.g. a secret path segment), capture the mechanism and file location — never the literal value (see SECRETS GATE)
- → `spec.json`: `routes[]` (one entry per route file, with its outgoing `links[]`)

### 3. Components
- List every component in the project's component directories (e.g. `src/components/`, `src/lib/components/`, `app/components/`, view partials)
- Per component: file path, what it does, live vs. dormant/legacy, shared vs. layout-specific
- → `spec.json`: `components[]`

### 4. State management
- Find all stores / state files (e.g. `src/stores/`, `src/lib/stores/`, `store/`, `state/` — Pinia/Vuex/Redux/Zustand/Svelte stores or equivalent)
- Per store: file path, exported symbols, state held, consumers
- → `spec.json`: `stores[]`

### 5. Server-side modules
- Auth config, database client setup, ORM schema files
- Integration modules (email, SMS, calendar, payments, etc.)
- Utility/helper modules — list key exported functions
- → `spec.json`: `serverLibs[]`, `integrations{}`, `utils[]`

### 6. Database schema
- Find all schema/model/entity files (ORM schemas, migrations, model definitions)
- Per table/collection: name, description, every column/field with type and constraints
- Map relationships (foreign keys, JSON arrays, many-to-many)
- → `spec.json`: `database.tables[]`, `database.relationships[]`

### 7. Business logic & auth
- Credit/pricing rules, booking/reservation rules, role hierarchy, visibility scoping, notification rules, rate limiting
- Auth provider, session strategy, OAuth scopes, password hashing
- Every hardcoded secret found during the scan → `businessLogic.security_notes` (location + purpose, value REDACTED, flagged for rotation)
- → `spec.json`: `auth{}`, `businessLogic{}`

### 8. Environment variables
- Scan `.env.example`, `.env`, schema/config files, or grep for the stack's env-access patterns (`process.env`, `$env/`, `os.environ`, `System.getenv`, `ENV[...]`, `env()`)
- Separate required from optional
- Record NAMES and descriptions only — never the actual values from a real `.env`
- → `spec.json`: `environmentVariables[]`

### 9. Scripts & commands
- Every script from the project's task runner (package.json scripts, Makefile, justfile, Taskfile, cargo/composer scripts)
- Group by: development, database, build/deploy
- → `spec.json`: `scripts.development[]`, `scripts.database[]`, `scripts.buildAndTest[]`

**Field guide:** each step fills exactly the `spec.json` keys listed on it — fill every one, never skip a key. Additionally, `topology.zones[]` is purely a layout description for `map.html`; `routes[].kind:"external"` entries are non-route infrastructure nodes (databases, third-party APIs) shown on the topology map.

---
## Output files
After analysis: check for an existing `.plan` directory or create it, then produce exactly two files in it.

### 1. `spec.json`
The **primary deliverable** — the single source of truth a future AI agent loads *instead of* re-scanning the repository. It must be detailed enough that an agent can locate the right file, understand the surrounding logic, and make a correct edit or fix a bug using `spec.json` alone. Every top-level key corresponds to one analysis step — do not skip a key, and do not summarize away specifics (exact file paths, exact column names, exact env var names, exact command strings). One exception to the "exact specifics" rule: secret VALUES are always redacted (SECRETS GATE) — describe where they live, never what they are. The example values in the schema below are illustrative — for projects on any stack, fill the same keys and shapes with the project's actual paths, frameworks, and names.

```json
{
"project": "slug",
"name": "Human-readable name",
"description": "One-paragraph description of what the app does and who it's for",
"version": "0.0.1",
"generatedAt": "YYYY-MM-DD",
"techStack": {
"framework": "SvelteKit 2 / Next.js 15 / ...",
"runtime": "Svelte 5 runes / React 19 / ...",
"styling": "Tailwind CSS 4 + DaisyUI 5 / ...",
"database": "Turso (LibSQL) / PostgreSQL / MongoDB / ...",
"orm": "Drizzle / Prisma / Mongoose / none",
"auth": "custom session cookie / next-auth / better-auth / ...",
"adapter": "node / vercel / static / ...",
"...": "add any other stack facts worth remembering (queue, cache, deploy target)"
},
"stackItems": [
{ "name": "SvelteKit", "version": "2", "tag": "framework" },
{ "name": "Nodemailer", "tag": "email" }
],
"routes": [
{
"id": "r-login",
"kind": "page",
"path": "/login",
"methods": "GET·POST",
"file": "src/routes/(login)/login/+page.server.ts",
"group": "(login)",
"accent": "auth",
"dotColor": null,
"tags": ["AUTH", "PUBLIC"],
"description": "What this route does, in enough detail to debug it without opening the file — key logic, side effects, redirects, validation. NEVER include literal secret values here — redact them and point at the file (SECRETS GATE).",
"links": [
{ "to": "r-dashboard", "type": "flow", "label": "session ok" }
]
}
],
"components": [
{
"id": "C-01",
"name": "Modal.svelte",
"file": "src/lib/components/Modal.svelte",
"status": "live",
"description": "What it renders, its props/events, and where it's used."
}
],
"stores": [
{
"file": "src/lib/stores/state.ts",
"name": "status",
"exports": ["status"],
"description": "What state it holds, who writes to it, who reads it."
}
],
"serverLibs": [
{
"id": "S-01",
"name": "database.ts",
"path": "src/lib/server/libsql/database.ts",
"description": "What it sets up / exports and who imports it."
}
],
"utils": [
{ "name": "utils", "file": "src/lib/utils.ts", "functions": ["fn1", "fn2"] }
],
"integrations": {
"mailer": {
"file": "src/lib/server/mailer.ts",
"functions": ["sendMail"],
"description": "Nodemailer wrapper — SMTP config from env, used by /api/mailer/* routes."
}
},
"database": {
"provider": "Turso (LibSQL)",
"orm": "Drizzle",
"tables": [
{
"name": "table_name",
"category": "core",
"description": "What this table represents in the domain.",
"columns": [
{ "name": "id", "type": "text", "primaryKey": true, "default": "nanoid(6)" },
{ "name": "field_name", "type": "text", "nullable": true, "references": "other_table.id" },
{ "name": "json_field", "type": "text", "mode": "json", "default": "[]" }
]
}
],
"relationships": [
{ "from": "documents", "to": "accounting_entries", "description": "One document → one journal entry." }
]
},
"auth": {
"provider": "custom session cookie",
"methods": ["password"],
"session": "sessionId cookie, validated in hooks.server.ts",
"passwordHash": "SHA-256 custom",
"guards": [
{ "scope": "(dashboard) group", "rule": "src/lib/pageAuth.ts redirects to /login when no valid session" }
]
},
"businessLogic": {
"key_concept": { "rule": "Precise description of the rule, including edge cases and where it's enforced (file/function)." },
"security_notes": { "rule": "One entry per hardcoded secret found in the codebase: its location and purpose, value REDACTED, flagged 'rotate and move to env'. Example: 'Report CSV endpoint authenticates via a hardcoded shared secret in the [id] path segment (src/routes/api/report/[id]/+server.ts) — value redacted; rotate and externalize.'" }
},
"environmentVariables": [
{ "name": "TURSO_TYPE", "required": true, "topic": "core", "description": "local | remote | sync" },
{ "name": "TURSO_AUTH_TOKEN", "required": true, "topic": "core", "description": "needed if remote", "conditional": true },
{ "name": "MAILER_SECURE", "required": false, "topic": "mailer", "description": "force TLS" }
],
"scripts": {
"development": [ { "cmd": "npm run dev", "description": "vite dev server" } ],
"database": [ { "cmd": "npm run db:update", "description": "drizzle-kit push" } ],
"buildAndTest": [ { "cmd": "npm run build", "description": "vite build" } ]
},
"topology": {
"zones": [
{ "kind": "zone", "layout": "stack", "emphasis": true, "label": "public + login", "columns": [["r-root", "r-login", "r-home"]] },
{ "kind": "gate", "label": "auth gate" },
{ "kind": "zone", "layout": "columns", "label": "dashboard + api", "columns": [
["r-companies", "r-accounts"],
["r-dashboard", "r-journal"],
["r-external", "r-base"]
]}
]
}
}
```

**Rules for filling `routes[]` and `routes[].links[]`** (this drives the Section 01 topology map and its wiring — get it right):
- `id` is a stable slug prefixed `r-`, reused verbatim as the DOM element id in `map.html` and as the `to`/`from` value in every `links` entry.
- `kind` is `"page"`, `"api"`, or `"external"` (external = infrastructure/3rd-party node like a database or mail provider, not an actual app route).
- `accent` is one of `public | protected | admin | api | dev | auth | ext` — pick `ext` only for `kind:"external"` nodes.
- `dotColor` is `null` by default (renders green); set to `"amber"` for redirect-type routes, `"blue"` for `kind:"external"` nodes, `"violet"` for dev/sandbox routes. Leave `null` otherwise.
- `links[].type` is one of `flow | admin | api | util | auth` (must match one of the 5 legend colors) and `label` is a short (1-3 word) phrase or `""`.
- Every route that is reachable from another route (or that reaches another route) must have that connection captured in `links` — the only source of truth for the wires; nothing is inferred separately in `map.html`.

### 2. `map.html`
A single self-contained HTML file. Use the template below — copy its `<style>` block and `<script>` block verbatim (only the `EDGES` array inside `<script>` is project data you replace). Customize the **content** only: masthead text, meta chips, nav labels (rarely needed), the topology zones/cards, and every section's cards/rows.

**Critical rules for the HTML:**
- The `<style>` block is **universal** — never change it except to add project-specific CSS classes if you truly need one beyond what's provided.
- The `<script>` block is **universal** and requires no per-project positioning math: wires are computed automatically at runtime from the real rendered position of each `.rcard` via `getBoundingClientRect()` — you never calculate coordinates by hand. You only supply two things: (1) which `.rcard` elements exist and which zone/column they sit in (plain DOM/flexbox layout, no absolute positioning), and (2) the `EDGES` array (built by flattening `routes[].links` from `spec.json` — see the comment above `var EDGES` in the script).
- Section 01's topology is built from `spec.json → topology.zones`. Each zone is either `{"kind":"gate"}` (render a `<div class="gate">` stripe, no cards) or `{"kind":"zone","layout":"stack"|"columns", ...}`. `layout:"stack"` → `<div class="zone">` (add class `hi` if `"emphasis":true`) with the route cards as **direct children**, ignoring the `columns` sub-array grouping. `layout:"columns"` → `<div class="zone dash">` with **one `<div class="col">` per inner array** in `columns`, each containing that array's route cards in order.
- Every `.rcard` needs: a unique `id` matching a `routes[].id`, the `acc-<accent>` class (or bare class `ext` for `kind:"external"`, which uses the dashed external-node style instead of an `acc-*` class), and `data-route` / `data-method` / `data-file` / `data-desc` / `data-tags` attributes copied straight from the matching `spec.json` route object — the inspector drawer reads these attributes directly, nothing else to wire up.
- Replace the `EDGES` array with one entry per `routes[].links[]` item, flattened: `[route.id, link.to, link.type, link.label]`.
- Section 02 (`.grid-c` of `.ccard`) ← `components[]`. Section 03 (`.grid-s` of `.scard`, twice — once for `stores[]`, once for `serverLibs[]`) ← as documented in the template comments, the two usages populate slightly different fields. Section 04 (`.db-board` of `.db-col`/`.tcard` + `.rel`) ← `database.tables[]` / `database.relationships[]`, with `category` mapped to `cat-1`..`cat-7` in first-seen order (8th+ distinct category: omit the `cat-N` class). Section 05 (`.stackrow`, `.cmdgrid`, `.envcard`) ← `stackItems[]`, `scripts.*[]`, `environmentVariables[]` grouped by `required` then by `topic`.
- The inspector drawer (`<aside class="insp">`) works automatically off the same `data-*` attributes and the `EDGES` array — do not hand-wire it. Its close behavior is the template's single shared `closeInspector()` (✕ button AND Escape both remove `.open` and set `aria-hidden="true"`) — do not split it back into separate handlers.
- HTML-escape EVERY project-derived string before writing it into `map.html` — both inside `data-*` attribute values and in visible text (`.route`, `.file`, `.desc`, `.cdesc`, `.sdesc`, `.cols`, `.vd`, `.cmdline`, zone labels). Minimum escaping: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, and inside attribute values `"` → `&quot;`. Placeholders like `<folderName>` / `<fileName>` must be written `&lt;folderName&gt;` / `&lt;fileName&gt;` — unescaped, the browser parses them as phantom start tags, the placeholders vanish from the rendered text, and the following text gets nested inside invisible elements. Mechanical check in FINAL REMINDER (c): any `<` inside a `data-*` value or any raw `<placeholder>` token in card text is a failed validation.
- Sections 02–05 are 1:1 renderings of the `spec.json` arrays — iterate the FULL array for each section in a single pass, never hand-pick entries or write cards from memory (a card list written "by eye" is exactly how an entry gets dropped). Every `components[]` entry → one `.ccard`; every `stores[]` entry → one `.scard` in the stores grid; every `serverLibs[]` entry → one `.scard` in the server libs grid; every `database.tables[]` entry → one `.tcard`; every `database.relationships[]` entry → one `.rel .r`; every `environmentVariables[]` entry → one `.envrow`; every `stackItems[]` entry → one `.stk`. No entry may be dropped (e.g. if `components[]` defines C-12, the ledger renders 12 cards, not 11).
- Every count printed in `map.html` — the masthead `.sheetmeta` line, each section's `.statrow` numbers, and each `.sec-sub` tally (e.g. "N live · M dormant") — must be computed from the same `spec.json` arrays it renders, AFTER the final card list is written, using the mechanical `grep -c` checks in FINAL REMINDER (b) — never by eye. The Section 02 live/dormant split must equal the `status` values in `components[]`; the Section 01 stat counters must equal the actual route `kind`/`accent` distribution.
- SECRETS GATE applies to `map.html` too: no secret value may appear in any `data-desc`, `.desc`, `.file`, `.cols`, or card text — the same redacted wording as in `spec.json`. Copy route descriptions verbatim from `spec.json` (already redacted) — NEVER re-derive them from the source files. If a secret is redacted in `spec.json` after `map.html` was generated, patch `map.html` in the same change (SECRETS GATE → two files, one fact set).

---
## HTML template
The complete `map.html` template. Every `<!-- ADAPT: ... -->` comment marks content you must replace with project-specific data. Everything else (CSS, JS, structure) stays as-is — extracted from a verified, correctly-rendering reference build; it must not be redesigned.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title><!-- ADAPT: PROJECT_NAME --> — App Structure Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Saira:wght@400;500;600;700;800&family=Saira+Condensed:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ============================================================
STRUCTURE MAP  —  blueprint / technical-drawing theme
Desktop visual support · non-responsive by design
============================================================ */
:root{
--bg:#080b11;
--bg-2:#0b0f17;
--panel:#0e131c;
--panel-2:#11182400;
--line:#1c2738;
--line-soft:#16202e;
--ink:#dfe7f2;
--ink-dim:#8a98ad;
--ink-faint:#56627a;
--grid:rgba(86,124,168,.07);
--green:#34d8a0;   /* page flow / data feed */
--coral:#ff6b6b;   /* admin manages / assigns */
--blue:#3fb6f2;    /* api · cron rails */
--violet:#a98bff;  /* utility / dev */
--amber:#f4b740;   /* auth / public redirect */
--mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
--disp:'Saira Condensed','Saira',system-ui,sans-serif;
--body:'Saira',system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
background:var(--bg);
color:var(--ink);
font-family:var(--body);
font-size:15px;
line-height:1.5;
-webkit-font-smoothing:antialiased;
overflow-x:hidden;
}
/* ---------- ambient background ---------- */
.ambient{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.ambient .grid{
position:absolute;inset:-2px;
background-image:
linear-gradient(var(--grid) 1px,transparent 1px),
linear-gradient(90deg,var(--grid) 1px,transparent 1px);
background-size:46px 46px;
mask-image:radial-gradient(120% 90% at 50% 0%,#000 35%,transparent 92%);
}
.ambient .glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.20;mix-blend-mode:screen}
.ambient .g1{width:620px;height:620px;left:-160px;top:120px;background:radial-gradient(circle,var(--amber),transparent 65%);animation:drift1 26s ease-in-out infinite}
.ambient .g2{width:720px;height:720px;right:-200px;top:520px;background:radial-gradient(circle,var(--blue),transparent 65%);animation:drift2 32s ease-in-out infinite}
.ambient .g3{width:560px;height:560px;left:38%;top:1500px;background:radial-gradient(circle,var(--green),transparent 65%);opacity:.12;animation:drift1 38s ease-in-out infinite reverse}
.ambient .scan{position:absolute;left:0;right:0;height:140px;top:0;
background:linear-gradient(180deg,transparent,rgba(63,182,242,.05),transparent);
animation:scan 11s linear infinite}
@keyframes drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,40px)}}
@keyframes drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(-70px,50px)}}
@keyframes scan{0%{transform:translateY(-160px)}100%{transform:translateY(120vh)}}
.wrap{position:relative;z-index:1;max-width:1720px;margin:0 auto;padding:42px 40px 120px}
/* ---------- masthead ---------- */
.mast{display:flex;align-items:flex-end;justify-content:space-between;gap:40px;
border-bottom:1px solid var(--line);padding-bottom:26px;margin-bottom:14px}
.brand{display:flex;align-items:center;gap:16px}
.brand .mark{
font-family:var(--disp);font-weight:800;letter-spacing:.06em;font-size:26px;
color:var(--bg);background:var(--ink);padding:6px 12px 4px;line-height:1;
box-shadow:6px 6px 0 var(--green);
}
.brand .stack{font-family:var(--mono);font-size:11px;letter-spacing:.32em;color:var(--ink-faint);text-transform:uppercase}
.brand .stack b{display:block;color:var(--ink-dim);letter-spacing:.18em;font-size:12px;margin-top:3px}
.mast h1{
font-family:var(--disp);font-weight:800;text-transform:uppercase;
font-size:clamp(40px,5vw,72px);line-height:.92;letter-spacing:.01em;margin:14px 0 0;
}
.mast h1 .thin{color:var(--ink-faint);font-weight:600}
.mast .lede{max-width:560px;color:var(--ink-dim);font-size:14px;margin-top:10px}
.mast .lede .hl{color:var(--green)}
.sheetmeta{font-family:var(--mono);font-size:11px;color:var(--ink-faint);text-align:right;letter-spacing:.06em;line-height:1.9;white-space:nowrap}
.sheetmeta b{color:var(--amber)}
/* ---------- nav ---------- */
nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:22px 0 40px;position:sticky;top:0;z-index:30;
background:linear-gradient(180deg,var(--bg) 70%,transparent);padding:10px 0 16px}
nav.tabs a{
font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
color:var(--ink-dim);text-decoration:none;padding:9px 16px;border:1px solid var(--line);
background:var(--panel);transition:.18s;display:flex;align-items:center;gap:9px}
nav.tabs a .n{color:var(--ink-faint);font-weight:700}
nav.tabs a:hover{color:var(--ink);border-color:var(--green);box-shadow:0 0 0 1px var(--green) inset,0 6px 22px -12px var(--green)}
nav.tabs a:hover .n{color:var(--green)}
/* ---------- section frame ---------- */
section{margin-bottom:78px;scroll-margin-top:80px}
.sec-head{display:flex;align-items:baseline;gap:18px;margin-bottom:6px}
.sec-head .num{font-family:var(--mono);font-size:12px;color:var(--green);letter-spacing:.2em}
.sec-head .crumb{font-family:var(--mono);font-size:11px;color:var(--ink-faint);letter-spacing:.1em}
.sec-title{font-family:var(--disp);font-weight:800;text-transform:uppercase;font-size:46px;line-height:1;letter-spacing:.01em;margin:2px 0 4px}
.sec-sub{font-family:var(--mono);font-size:11px;color:var(--ink-faint);letter-spacing:.16em;text-transform:uppercase;margin-bottom:24px}
.sec-sub b{color:var(--ink-dim)}
.statrow{display:flex;gap:34px;margin-left:auto}
.stat{text-align:right}
.stat .v{font-family:var(--disp);font-weight:800;font-size:40px;line-height:.9}
.stat .k{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--ink-faint);text-transform:uppercase}
.stat.s1 .v{color:var(--green)} .stat.s2 .v{color:var(--amber)} .stat.s3 .v{color:var(--blue)} .stat.s4 .v{color:var(--violet)}
/* ============================================================
SECTION 01 — ROUTE TOPOLOGY
============================================================ */
.legend{display:flex;flex-wrap:wrap;gap:8px 22px;align-items:center;
font-family:var(--mono);font-size:11px;color:var(--ink-dim);letter-spacing:.05em;
border:1px dashed var(--line);padding:12px 16px;margin-bottom:18px;background:rgba(14,19,28,.5)}
.legend .li{display:flex;align-items:center;gap:9px;cursor:default;transition:.15s;padding:2px 4px}
.legend .li:hover{color:var(--ink)}
.legend .ln{width:34px;height:0;border-top-width:2px;border-top-style:solid}
.legend .ln.flow{border-color:var(--green)}
.legend .ln.admin{border-color:var(--coral);border-top-style:dashed}
.legend .ln.api{border-color:var(--blue);border-top-style:dashed}
.legend .ln.util{border-color:var(--violet)}
.legend .ln.auth{border-color:var(--amber);border-top-style:dashed}
.legend .hint{margin-left:auto;color:var(--ink-faint)}
.legend .hint b{color:var(--amber)} .legend .hint i{color:var(--blue);font-style:normal}
/* horizontal scroll viewport — vertical expands with content */
.topo-scroll{overflow-x:auto;overflow-y:visible;padding-bottom:14px;
scrollbar-color:var(--green) var(--line-soft)}
.topo-scroll::-webkit-scrollbar{height:11px}
.topo-scroll::-webkit-scrollbar-track{background:var(--line-soft)}
.topo-scroll::-webkit-scrollbar-thumb{background:#23324a;border:2px solid var(--line-soft)}
.topo-scroll::-webkit-scrollbar-thumb:hover{background:var(--green)}
.topo-canvas{position:relative;display:flex;align-items:stretch;gap:30px;
min-width:max-content;padding:26px 30px 30px}
.topo-wires{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible}
.wire{fill:none;stroke-width:1.6;opacity:.42;transition:opacity .2s,stroke-width .2s}
.wire.flow{stroke:var(--green)} .wire.admin{stroke:var(--coral);stroke-dasharray:7 6}
.wire.api{stroke:var(--blue);stroke-dasharray:3 5} .wire.util{stroke:var(--violet)}
.wire.auth{stroke:var(--amber);stroke-dasharray:9 5 2 5}
.topo-canvas.tracing .wire:not(.hot){opacity:.08}
.wire.hot{opacity:1;stroke-width:2.6;filter:drop-shadow(0 0 5px currentColor)}
.wire-label{font-family:var(--mono);font-size:9.5px;fill:var(--ink-faint);letter-spacing:.04em;
paint-order:stroke;stroke:var(--bg);stroke-width:3px;opacity:0;transition:opacity .2s}
.wire-label.hot{opacity:1;fill:var(--ink-dim)}
/* zone group boxes */
.zone{position:relative;z-index:1;display:flex;flex-direction:column;gap:18px;padding:30px 18px 18px;
border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,19,28,.55),rgba(8,11,17,.2));min-width:300px}
.zone.hi{border-color:rgba(244,183,64,.35);box-shadow:0 0 60px -28px var(--amber) inset}
.zone.dash{flex-direction:row;align-items:stretch;gap:24px;min-width:0;padding-top:34px}
.zone .zlabel{position:absolute;top:-1px;left:18px;transform:translateY(-50%);
font-family:var(--mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;
background:var(--bg);padding:3px 10px;color:var(--ink-dim);border:1px solid var(--line)}
.zone.hi .zlabel{color:var(--amber);border-color:rgba(244,183,64,.4)}
.zone.dash .zlabel{color:var(--green);border-color:rgba(52,216,160,.4)}
.col{display:flex;flex-direction:column;gap:18px;min-width:288px}
/* auth gate stripe */
.gate{position:relative;z-index:1;width:46px;flex:0 0 46px;align-self:stretch;
background:repeating-linear-gradient(135deg,rgba(244,183,64,.16) 0 9px,transparent 9px 18px);
border-left:1px solid rgba(244,183,64,.4);border-right:1px solid rgba(244,183,64,.4);
display:flex;align-items:center;justify-content:center}
.gate span{writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--mono);
font-size:10px;letter-spacing:.4em;color:var(--amber);text-transform:uppercase}
/* route card */
.rcard{position:relative;z-index:2;width:288px;background:var(--panel);
border:1px solid var(--line);border-left:3px solid var(--ink-faint);
padding:13px 14px 12px;cursor:pointer;transition:transform .16s,box-shadow .2s,border-color .2s,background .2s}
.rcard:hover{transform:translateY(-3px);background:#121a26}
.rcard.linked{box-shadow:0 0 0 1px currentColor,0 10px 30px -16px currentColor}
.rcard .top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.rcard .route{font-family:var(--mono);font-weight:700;font-size:14.5px;letter-spacing:-.01em;word-break:break-all}
.rcard .meth{flex:0 0 auto;font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;
color:var(--ink-dim);border:1px solid var(--line);padding:3px 7px;display:flex;align-items:center;gap:6px;white-space:nowrap}
.rcard .meth .dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 7px var(--green)}
.rcard .file{font-family:var(--mono);font-size:10px;color:var(--ink-faint);margin:7px 0 6px;line-height:1.45;word-break:break-all}
.rcard .desc{font-size:12.5px;color:var(--ink-dim);line-height:1.42;margin:0 0 9px}
.rcard .tags{display:flex;flex-wrap:wrap;gap:5px}
/* accent → left border + route title colour */
.acc-admin{border-left-color:var(--coral);color:var(--coral)}      .acc-admin .route{color:var(--coral)}
.acc-protected{border-left-color:var(--green);color:var(--green)}  .acc-protected .route{color:var(--green)}
.acc-public{border-left-color:var(--amber);color:var(--amber)}     .acc-public .route{color:var(--amber)}
.acc-api{border-left-color:var(--blue);color:var(--blue)}          .acc-api .route{color:var(--blue)}
.acc-dev{border-left-color:var(--violet);color:var(--violet)}      .acc-dev .route{color:var(--violet)}
.acc-auth{border-left-color:var(--amber);color:var(--amber)}       .acc-auth .route{color:var(--amber)}
.rcard:hover{box-shadow:0 14px 34px -20px currentColor}
/* external node */
.rcard.ext{border-style:dashed;border-left-style:dashed;border-color:rgba(63,182,242,.5);
background:repeating-linear-gradient(45deg,rgba(63,182,242,.05) 0 8px,transparent 8px 16px),var(--panel)}
.rcard.ext .route{color:var(--blue)}
/* tag chips */
.tag{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;
padding:2px 7px;border:1px solid currentColor;color:var(--ink-faint);opacity:.92}
.tag-admin{color:var(--coral)} .tag-protected{color:var(--green)} .tag-public{color:var(--amber)}
.tag-auth{color:var(--amber)} .tag-api{color:var(--blue)} .tag-dev{color:var(--violet)}
/* unmapped/custom tags (e.g. SEO, EMAIL, DATA, CREATE...) simply use the neutral base .tag style above —
add more tag-<name>{color:...} rules here ONLY if a tag needs to stand out; not required for correctness. */
/* ============================================================
SECTION 02 — COMPONENT LEDGER
============================================================ */
.grid-c{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.ccard{position:relative;background:var(--panel);border:1px solid var(--line);padding:14px 15px 13px;
overflow:hidden;transition:.18s}
.ccard:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--green)}
.ccard:hover{transform:translateY(-3px);border-color:#27384f;box-shadow:0 16px 36px -22px var(--green)}
.ccard .cid{font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.1em}
.ccard .cname{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--ink);margin:3px 0 2px}
.ccard .cpath{font-family:var(--mono);font-size:9.5px;color:var(--violet);margin-bottom:7px;word-break:break-all}
.ccard .cdesc{font-size:12px;color:var(--ink-dim);line-height:1.42}
.ccard .pill{position:absolute;top:12px;right:12px;font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;
padding:2px 7px;border:1px solid var(--green);color:var(--green)}
.ccard.dorm{opacity:.5}
.ccard.dorm:before{background:var(--ink-faint)}
.ccard.dorm .pill{border-color:var(--ink-faint);color:var(--ink-faint)}
/* ============================================================
SECTION 03 — STATE & SERVER
============================================================ */
.grp-label{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;
color:var(--ink-dim);margin:0 0 12px;display:flex;align-items:center;gap:12px}
.grp-label:after{content:"";flex:1;height:1px;background:var(--line)}
.grp-label .src{color:var(--ink-faint);letter-spacing:.08em}
.grid-s{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:34px}
.scard{background:var(--panel);border:1px solid var(--line);padding:14px 15px;transition:.18s}
.scard:hover{transform:translateY(-3px);border-color:#27384f;box-shadow:0 16px 36px -24px var(--blue)}
.scard .sid{font-family:var(--mono);font-size:10px;color:var(--green);letter-spacing:.1em}
.scard .sname{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--ink);margin:3px 0 1px}
.scard .spath{font-family:var(--mono);font-size:9.5px;color:var(--violet);margin-bottom:7px}
.scard .sdesc{font-size:12px;color:var(--ink-dim);line-height:1.42;margin-bottom:9px}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{font-family:var(--mono);font-size:9.5px;color:var(--blue);background:rgba(63,182,242,.08);
border:1px solid rgba(63,182,242,.25);padding:2px 7px}
/* ============================================================
SECTION 04 — DATABASE BOARD
============================================================ */
.db-scroll{overflow-x:auto;overflow-y:visible;padding-bottom:12px;scrollbar-color:var(--blue) var(--line-soft)}
.db-scroll::-webkit-scrollbar{height:11px}
.db-scroll::-webkit-scrollbar-track{background:var(--line-soft)}
.db-scroll::-webkit-scrollbar-thumb{background:#23324a}
.db-board{display:flex;gap:16px;min-width:max-content;align-items:flex-start}
.db-col{display:flex;flex-direction:column;gap:12px;min-width:248px;max-width:268px}
.db-col .cat{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;
color:var(--bg);background:var(--blue);padding:4px 10px;align-self:flex-start;margin-bottom:2px}
.db-col.cat-1 .cat{background:var(--amber)} .db-col.cat-2 .cat{background:var(--green);color:#04130d}
.db-col.cat-3 .cat{background:var(--coral);color:#1a0606} .db-col.cat-4 .cat{background:var(--violet);color:#0d0720}
.db-col.cat-5 .cat{background:#e08a3c;color:#1a0d02} .db-col.cat-6 .cat{background:#3fb6f2}
.db-col.cat-7 .cat{background:#56627a}
/* 8th+ distinct category: omit the cat-N class and let it fall back to the default blue .cat style above */
.tcard{background:var(--panel);border:1px solid var(--line);padding:11px 12px;transition:.16s}
.tcard:hover{border-color:#27384f;transform:translateX(3px)}
.tcard .tname{font-family:var(--mono);font-weight:700;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:7px}
.tcard .tname:before{content:"■";color:var(--blue);font-size:9px}
.tcard .cols{font-family:var(--mono);font-size:9.5px;color:var(--ink-faint);line-height:1.65;margin-top:6px}
.tcard .cols .j{color:var(--amber)} .tcard .cols .k{color:var(--ink-dim)}
.rel{margin-top:26px;border:1px solid var(--line);background:var(--panel);padding:18px 20px}
.rel h4{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--green);margin:0 0 14px}
.rel .r{display:grid;grid-template-columns:300px 1fr;gap:14px;padding:8px 0;border-top:1px dashed var(--line-soft);font-size:12.5px}
.rel .r:first-of-type{border-top:0}
.rel .r .a{font-family:var(--mono);color:var(--blue);font-size:11.5px}
.rel .r .a .ar{color:var(--green)}
.rel .r .b{color:var(--ink-dim)}
/* ============================================================
SECTION 05 — STACK & OPS
============================================================ */
.stackrow{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:30px}
.stk{font-family:var(--mono);font-size:12px;color:var(--ink);background:var(--panel);border:1px solid var(--line);
padding:9px 14px;display:flex;align-items:center;gap:9px;transition:.16s}
.stk:hover{border-color:var(--green);transform:translateY(-2px)}
.stk .v{color:var(--green);font-weight:700}
.stk .t{color:var(--ink-faint);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase}
.cmdgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:34px}
.cmdblock{border:1px solid var(--line);background:var(--panel);padding:16px 18px}
.cmdblock h4{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);
margin:0 0 12px;display:flex;align-items:center;gap:8px}
.cmdblock h4:before{content:"▸";color:var(--green)}
.cmdline{display:flex;justify-content:space-between;gap:14px;font-family:var(--mono);font-size:11.5px;
padding:6px 0;border-top:1px dashed var(--line-soft)}
.cmdline:first-of-type{border-top:0}
.cmdline .c{color:var(--green)} .cmdline .d{color:var(--ink-faint);text-align:right}
/* ONE big environment card */
.envcard{border:1px solid var(--line);background:
linear-gradient(180deg,rgba(63,182,242,.04),transparent 120px),var(--panel);
padding:24px 26px 26px;position:relative;overflow:hidden}
.envcard:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;
background:linear-gradient(90deg,var(--blue),var(--green),var(--amber))}
.envcard .envhead{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px}
.envcard .envhead h3{font-family:var(--disp);font-weight:700;text-transform:uppercase;letter-spacing:.06em;
font-size:24px;margin:0;color:var(--ink)}
.envcard .envhead .src{font-family:var(--mono);font-size:11px;color:var(--ink-faint);letter-spacing:.1em}
.envcard .envnote{font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-bottom:20px}
.envgroup{margin-bottom:22px}
.envgroup:last-child{margin-bottom:0}
.envgroup .gh{font-family:var(--mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;
color:var(--ink-dim);margin-bottom:12px;display:flex;align-items:center;gap:10px}
.envgroup .gh:after{content:"";flex:1;height:1px;background:var(--line)}
.envgroup .gh .req{color:var(--coral)} .envgroup .gh .opt{color:var(--ink-faint)}
.envgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 40px}
.envrow{display:grid;grid-template-columns:200px 78px 1fr;align-items:center;gap:14px;
padding:7px 0;border-bottom:1px dashed var(--line-soft)}
.envrow .vn{font-family:var(--mono);font-weight:600;font-size:12.5px;color:var(--blue)}
.envrow .vb{font-family:var(--mono);font-size:8.5px;letter-spacing:.12em;text-align:center;
padding:2px 0;border:1px solid currentColor}
.envrow .vb.req{color:var(--coral)} .envrow .vb.opt{color:var(--ink-faint)}
.envrow .vd{font-size:12px;color:var(--ink-dim)}
.envrow .vd .or{color:var(--amber);font-family:var(--mono);font-size:10px}
/* ============================================================
INSPECTOR DRAWER
============================================================ */
.insp{position:fixed;top:0;right:0;height:100vh;width:380px;z-index:60;
background:linear-gradient(180deg,#0d131d,#080b11);border-left:1px solid var(--green);
box-shadow:-30px 0 80px -40px #000;transform:translateX(105%);transition:transform .32s cubic-bezier(.2,.8,.2,1);
padding:26px 24px;overflow-y:auto}
.insp.open{transform:translateX(0)}
.insp .x{position:absolute;top:18px;right:18px;font-family:var(--mono);font-size:13px;color:var(--ink-dim);
background:none;border:1px solid var(--line);width:30px;height:30px;cursor:pointer;transition:.15s}
.insp .x:hover{color:var(--coral);border-color:var(--coral)}
.insp .ilabel{font-family:var(--mono);font-size:10px;letter-spacing:.24em;color:var(--green);text-transform:uppercase}
.insp .iroute{font-family:var(--mono);font-weight:700;font-size:21px;color:var(--ink);margin:6px 0 4px;word-break:break-all}
.insp .imeth{font-family:var(--mono);font-size:11px;color:var(--amber);letter-spacing:.1em}
.insp .ifile{font-family:var(--mono);font-size:11px;color:var(--violet);margin:14px 0;line-height:1.5;
background:rgba(169,139,255,.06);border:1px solid var(--line);padding:9px 11px;word-break:break-all}
.insp .idesc{font-size:13px;color:var(--ink-dim);line-height:1.5;margin:0 0 16px}
.insp .itags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.insp .iconn h5{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;
color:var(--ink-faint);margin:18px 0 8px}
.insp .iconn a{display:block;font-family:var(--mono);font-size:11.5px;color:var(--blue);text-decoration:none;
padding:5px 0;border-top:1px dashed var(--line-soft);cursor:pointer}
.insp .iconn a:hover{color:var(--green)}
.insp .iconn a .dir{color:var(--ink-faint);margin-right:8px}
.insp .empty{color:var(--ink-faint);font-family:var(--mono);font-size:11px}
/* reveal */
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
</style></head>
<body>
<div class="ambient">
<div class="grid"></div>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="scan"></div>
</div>
<div class="wrap">
<!-- ===================== MASTHEAD ===================== -->
<header class="mast">
<div>
<div class="brand">
<!-- ADAPT: short uppercase project code, e.g. project slug -->
<span class="mark">PROJECT</span>
<span class="stack">structure<b>map</b></span>
</div>
<h1>App Structure <span class="thin">Map</span></h1>
<!-- ADAPT: one-line project summary (from spec.json description) + key stack highlight -->
<p class="lede">One-paragraph description of what the app does.
<span class="hl">Framework · version</span>, database, styling.</p>
</div>
<!-- ADAPT: sheet metadata — route/table counts COMPUTED from spec.json (see critical rules), framework, today's date -->
<div class="sheetmeta">
SHEET <b>A‑01</b> · ROUTE TOPOLOGY<br>
SCALE 1:NTS · REV YYYY‑MM‑DD<br>
Framework · runtime<br>
N routes · M tables · Database / ORM
</div>
</header>
<!-- ===================== NAV — fixed, no ADAPT needed ===================== -->
<nav class="tabs">
<a href="#s01"><span class="n">01</span> Routes</a>
<a href="#s02"><span class="n">02</span> Components</a>
<a href="#s03"><span class="n">03</span> State + Server</a>
<a href="#s04"><span class="n">04</span> Database</a>
<a href="#s05"><span class="n">05</span> Stack + Cmds</a>
</nav>
<!-- ===================== SECTION 01 — ROUTE TOPOLOGY ===================== -->
<section id="s01">
<div class="sec-head">
<span class="num">SECTION 01</span>
<!-- ADAPT: routes glob, e.g. src/routes/** -->
<span class="crumb">src/routes/**</span>
<!-- ADAPT: counts — total route files, public, protected, api rails (computed from routes[]) -->
<div class="statrow">
<div class="stat s1"><div class="v">N</div><div class="k">route files</div></div>
<div class="stat s2"><div class="v">N</div><div class="k">public</div></div>
<div class="stat s3"><div class="v">N</div><div class="k">protected</div></div>
<div class="stat s4"><div class="v">N</div><div class="k">api rails</div></div>
</div>
</div>
<h2 class="sec-title">Route Topology</h2>
<div class="sec-sub">page flow / data feed · admin manages / assigns · api · cron rails · utility / dev · auth redirect &nbsp;—&nbsp; <b>hover</b> = trace connections · <b>click</b> = inspect route</div>
<!-- legend — fixed 5 types, no ADAPT needed (must match the 5 "type" values used in links/EDGES) -->
<div class="legend" id="legend">
<span class="li" data-type="flow"><span class="ln flow"></span> page flow / data feed</span>
<span class="li" data-type="admin"><span class="ln admin"></span> admin manages / assigns</span>
<span class="li" data-type="api"><span class="ln api"></span> api · cron rails</span>
<span class="li" data-type="util"><span class="ln util"></span> utility / dev</span>
<span class="li" data-type="auth"><span class="ln auth"></span> auth redirect</span>
<span class="hint"><b>hover</b> = trace connections · <i>click</i> = inspect route →</span>
</div>
<div class="topo-scroll">
<div class="topo-canvas" id="canvas">
<svg class="topo-wires" id="wires"></svg>
<!-- ADAPT: one <div class="zone[.hi]"> per spec.json → topology.zones[] entry with layout:"stack".
Add class "hi" only if that zone's "emphasis" is true. Route cards are DIRECT children (no .col wrapper).
Repeat this whole block for every "stack" zone. -->
<div class="zone hi">
<span class="zlabel"><!-- ADAPT: zone label --></span>
<!-- ADAPT: one .rcard per route in this zone's columns (flattened).
id = routes[].id · class = "rcard acc-<accent>" (or "rcard ext" for kind:"external")
data-route/data-method/data-file/data-desc/data-tags copied from the matching spec.json route
object (already redacted — never re-read source files for raw values), HTML-ESCAPED
(& < > " — see critical rules; never a literal secret value).
The inline <i class="dot" style="..."> override is OPTIONAL — only add it when
routes[].dotColor is set (amber/blue/violet); omit the style attribute entirely for the default green dot. -->
<div class="rcard acc-public" id="r-example"
data-route="/example" data-method="GET"
data-file="src/routes/example/+page.server.ts"
data-desc="What this route does."
data-tags="PUBLIC">
<div class="top"><span class="route">/example</span><span class="meth">GET<i class="dot"></i></span></div>
<div class="file">src/routes/example/+page.server.ts</div>
<p class="desc">What this route does.</p>
<div class="tags"><span class="tag tag-public">PUBLIC</span></div>
</div>
</div>
<!-- ADAPT: one <div class="gate"><span>LABEL</span></div> per topology.zones[] entry with kind:"gate".
Omit entirely if the project has no such boundary (e.g. no auth middleware separating zones). -->
<div class="gate"><span>auth gate</span></div>
<!-- ADAPT: one <div class="zone dash"> per topology.zones[] entry with layout:"columns".
Inside it, one <div class="col"> per inner array in that zone's "columns", cards in order. -->
<div class="zone dash">
<span class="zlabel"><!-- ADAPT: zone label --></span>
<div class="col">
<!-- ADAPT: .rcard elements for this column, same structure as above -->
</div>
<div class="col">
<!-- ADAPT: .rcard elements for this column -->
</div>
<div class="col">
<!-- ADAPT: external/dev/api nodes can live in their own column, e.g.: -->
<div class="rcard ext" id="r-external-db"
data-route="EXTERNAL · Database name" data-method="◈"
data-file="Provider / connection mode"
data-desc="What this external service is used for."
data-tags="DATA">
<div class="top"><span class="route">EXTERNAL · Database</span><span class="meth">◈<i class="dot" style="background:var(--blue);box-shadow:0 0 7px var(--blue)"></i></span></div>
<div class="file">Provider / connection mode</div>
<p class="desc">What this external service is used for.</p>
<div class="tags"><span class="tag tag-api">DATA</span></div>
</div>
</div>
</div>
</div>
</div>
</section>
<!-- ===================== SECTION 02 — COMPONENT LEDGER ===================== -->
<section id="s02" class="reveal">
<div class="sec-head"><span class="num">SECTION 02</span><!-- ADAPT: components dir(s) --><span class="crumb">src/lib/components/</span></div>
<h2 class="sec-title">Component Ledger</h2>
<!-- ADAPT: counts — COMPUTED by walking components[]: total, status:"live", status:"dormant".
One .ccard per components[] entry, no omissions. -->
<div class="sec-sub"><b>N</b> live · <b>M</b> dormant</div>
<div class="grid-c">
<!-- ADAPT: one .ccard per components[] entry. pill = LIVE (status:"live") or DORMANT (status:"dormant", add class "dorm" on .ccard) -->
<div class="ccard"><span class="pill">LIVE</span><div class="cid">C‑01</div><div class="cname">Component.svelte</div><div class="cpath">src/lib/components/</div><div class="cdesc">What it does.</div></div>
<div class="ccard dorm"><span class="pill">DORMANT</span><div class="cid">C‑02</div><div class="cname">Unused.svelte</div><div class="cpath">src/lib/components/</div><div class="cdesc">Why it's dormant / no longer referenced.</div></div>
</div>
</section>
<!-- ===================== SECTION 03 — STATE & SERVER ===================== -->
<section id="s03" class="reveal">
<div class="sec-head"><span class="num">SECTION 03</span><!-- ADAPT: stores + server lib dirs --><span class="crumb">src/lib/stores/ · src/lib/server/</span></div>
<h2 class="sec-title">Registers &amp; Wiring</h2>
<!-- ADAPT: counts — computed from stores[] and serverLibs[] lengths -->
<div class="sec-sub"><b>N</b> stores · <b>M</b> server libs</div>
<div class="grp-label">state registers <span class="src"><!-- ADAPT: stores path --></span></div>
<div class="grid-s">
<!-- ADAPT: one .scard per stores[] entry — sid=file name, sname=exported symbol/store name, sdesc=description, chips=exports -->
<div class="scard"><div class="sid">store.ts</div><div class="sname">storeName</div><div class="sdesc">What state it holds.</div><div class="chips"><span class="chip">exportedSymbol</span></div></div>
</div>
<div class="grp-label">server libs <span class="src"><!-- ADAPT: server lib path --></span></div>
<div class="grid-s">
<!-- ADAPT: one .scard per serverLibs[] entry — sid=id (S-01…), sname=file name, spath=subfolder, sdesc=description (no chips here) -->
<div class="scard"><div class="sid">S‑01</div><div class="sname">module.ts</div><div class="spath">server/</div><div class="sdesc">What it sets up / exports.</div></div>
</div>
</section>
<!-- ===================== SECTION 04 — DATABASE BOARD ===================== -->
<section id="s04" class="reveal">
<!-- ADAPT: schema source / provider -->
<div class="sec-head"><span class="num">SECTION 04</span><span class="crumb">schema · provider</span></div>
<h2 class="sec-title">Database Board</h2>
<!-- ADAPT: counts + provider/orm — computed from database.tables[] -->
<div class="sec-sub"><b>N</b> tables · provider · orm</div>
<div class="db-scroll">
<div class="db-board">
<!-- ADAPT: one .db-col per distinct database.tables[].category (in first-seen order → cat-1..cat-7,
8th+ distinct category omits the cat-N class). One .tcard per table in that category. -->
<div class="db-col cat-1"><span class="cat">category</span>
<div class="tcard"><div class="tname">table_name</div><div class="cols"><span class="k">id</span> <span class="k">column</span> <span class="j">json_column (json)</span></div></div>
</div>
</div>
</div>
<!-- ADAPT: one .r per database.relationships[] entry -->
<div class="rel">
<h4>key relationships</h4>
<div class="r"><div class="a">table_a <span class="ar">─▸</span> table_b</div><div class="b">Description of the relationship.</div></div>
</div>
</section>
<!-- ===================== SECTION 05 — STACK & OPS ===================== -->
<section id="s05" class="reveal">
<div class="sec-head"><span class="num">SECTION 05</span><span class="crumb">tech stack &amp; commands</span></div>
<h2 class="sec-title">Stack &amp; Ops</h2>
<!-- ADAPT: counts — computed from stackItems[] and environmentVariables[] -->
<div class="sec-sub"><b>N</b> stack items · <b>M</b> env vars</div>
<!-- ADAPT: one .stk per stackItems[] entry -->
<div class="stackrow">
<div class="stk">Name <span class="v">version</span><span class="t">tag</span></div>
</div>
<!-- ADAPT: 3 fixed columns — development / database / build&test, from scripts.*.
If a project genuinely has no commands for one bucket, repurpose it for the next most relevant
category (e.g. "deploy" or "lint") rather than leaving the column empty. -->
<div class="cmdgrid">
<div class="cmdblock">
<h4>development</h4>
<div class="cmdline"><span class="c">command</span><span class="d">what it does</span></div>
</div>
<div class="cmdblock">
<h4>database</h4>
<div class="cmdline"><span class="c">command</span><span class="d">what it does</span></div>
</div>
<div class="cmdblock">
<h4>build &amp; test</h4>
<div class="cmdline"><span class="c">command</span><span class="d">what it does</span></div>
</div>
</div>
<!-- ONE big environment card — split environmentVariables[] into required / optional,
"gh" header text = unique "topic" values in that group joined by " · " -->
<div class="envcard">
<div class="envhead">
<h3>Environment Variables</h3>
<span class="src">.env</span>
</div>
<div class="envnote">All values loaded at boot. <span style="color:var(--coral)">REQUIRED</span> keys must be present; <span style="color:var(--ink-faint)">OPTIONAL</span> keys enable secondary features.</div>
<div class="envgroup">
<div class="gh"><span class="req">required</span> <!-- ADAPT: topics --></div>
<div class="envgrid">
<!-- ADAPT: one .envrow per required env var. Add class "opt" on .vb + swap OPT if not required.
The .or span is only for a short "(conditional)" note when applicable. -->
<div class="envrow"><span class="vn">VAR_NAME</span><span class="vb req">REQ</span><span class="vd">what it configures</span></div>
</div>
</div>
<div class="envgroup">
<div class="gh"><span class="opt">optional</span> <!-- ADAPT: topics --></div>
<div class="envgrid">
<div class="envrow"><span class="vn">OPT_VAR</span><span class="vb opt">OPT</span><span class="vd">what it configures</span></div>
</div>
</div>
</div>
</section>
</div>
<!-- ===================== INSPECTOR DRAWER — DO NOT MODIFY, driven entirely by JS ===================== -->
<aside class="insp" id="insp" aria-hidden="true">
<button class="x" id="inspClose" aria-label="close">✕</button>
<div class="ilabel">route inspector</div>
<div class="iroute" id="iRoute">/</div>
<div class="imeth" id="iMeth">—</div>
<div class="ifile" id="iFile">—</div>
<p class="idesc" id="iDesc">Click any route node in the topology to inspect it.</p>
<div class="itags" id="iTags"></div>
<div class="iconn">
<h5>connections</h5>
<div id="iConn"><span class="empty">no connections traced</span></div>
</div>
</aside>
<script>
(function(){
"use strict";

/* ---------- edges: [from, to, type, label] ----------
ADAPT: build this array by flattening spec.json → routes[].links.
For every route object in spec.json, for every entry in its "links" array,
push [route.id, link.to, link.type, link.label]. Do this for ALL routes
(including kind:"external" nodes, which can be link targets too). */
var EDGES = [
["r-example-a","r-example-b","flow","short label"]
];

var SVGNS = "http://www.w3.org/2000/svg";
var canvas = document.getElementById("canvas");
var svg = document.getElementById("wires");
var cards = Array.prototype.slice.call(canvas.querySelectorAll(".rcard"));
var cardById = {};
cards.forEach(function(c){ cardById[c.id] = c; });

/* arrow markers, one per colour */
var COLORS = {flow:"#34d8a0",admin:"#ff6b6b",api:"#3fb6f2",util:"#a98bff",auth:"#f4b740"};
var defs = document.createElementNS(SVGNS,"defs");
Object.keys(COLORS).forEach(function(t){
var m = document.createElementNS(SVGNS,"marker");
m.setAttribute("id","ah-"+t);
m.setAttribute("viewBox","0 0 10 10");
m.setAttribute("refX","8"); m.setAttribute("refY","5");
m.setAttribute("markerWidth","7"); m.setAttribute("markerHeight","7");
m.setAttribute("orient","auto-start-reverse");
var p = document.createElementNS(SVGNS,"path");
p.setAttribute("d","M0,0 L10,5 L0,10 z");
p.setAttribute("fill",COLORS[t]);
m.appendChild(p); defs.appendChild(m);
});
svg.appendChild(defs);

/* build path + label elements */
var wireEls = [];
EDGES.forEach(function(e,i){
var path = document.createElementNS(SVGNS,"path");
path.setAttribute("class","wire "+e[2]);
path.setAttribute("marker-end","url(#ah-"+e[2]+")");
path.dataset.from = e[0]; path.dataset.to = e[1]; path.dataset.type = e[2];
svg.appendChild(path);
var lbl = document.createElementNS(SVGNS,"text");
lbl.setAttribute("class","wire-label");
lbl.dataset.from = e[0]; lbl.dataset.to = e[1]; lbl.dataset.type = e[2];
lbl.textContent = e[3] || "";
svg.appendChild(lbl);
wireEls.push({path:path,lbl:lbl,edge:e});
});

function rect(el){
var cr = canvas.getBoundingClientRect();
var r = el.getBoundingClientRect();
return {l:r.left-cr.left, t:r.top-cr.top, r:r.right-cr.left, b:r.bottom-cr.top,
w:r.width, h:r.height, cx:(r.left+r.right)/2-cr.left, cy:(r.top+r.bottom)/2-cr.top};
}
function anchor(fromR, toR, side){
if(side==="r") return {x:fromR.r, y:fromR.cy};
if(side==="l") return {x:fromR.l, y:fromR.cy};
if(side==="b") return {x:fromR.cx, y:fromR.b};
return {x:fromR.cx, y:fromR.t};
}

function draw(){
var w = canvas.scrollWidth, h = canvas.scrollHeight;
svg.setAttribute("width", w); svg.setAttribute("height", h);
svg.setAttribute("viewBox","0 0 "+w+" "+h);
wireEls.forEach(function(we){
var a = cardById[we.edge[0]], b = cardById[we.edge[1]];
if(!a||!b) return;
var ar = rect(a), br = rect(b);
var sameCol = Math.abs(ar.cx-br.cx) < 60;
var sSide, tSide;
if(sameCol){ sSide = ar.cy<br.cy?"b":"t"; tSide = ar.cy<br.cy?"t":"b"; }
else if(br.cx>ar.cx){ sSide="r"; tSide="l"; }
else { sSide="l"; tSide="r"; }
var p1 = anchor(ar,br,sSide), p2 = anchor(br,ar,tSide);
var dx = (p2.x-p1.x), dy = (p2.y-p1.y);
var c1x,c1y,c2x,c2y;
if(sameCol){
var off = Math.max(40, Math.abs(dy)*0.4);
c1x=p1.x+off; c1y=p1.y; c2x=p2.x+off; c2y=p2.y;
} else {
var hx = Math.max(40, Math.abs(dx)*0.5);
c1x = p1.x + (sSide==="r"?hx:-hx); c1y = p1.y;
c2x = p2.x + (tSide==="l"?-hx:hx); c2y = p2.y;
}
we.path.setAttribute("d","M"+p1.x+","+p1.y+" C"+c1x+","+c1y+" "+c2x+","+c2y+" "+p2.x+","+p2.y);
we.lbl.setAttribute("x", (p1.x+p2.x)/2 + (sameCol?22:0));
we.lbl.setAttribute("y", (p1.y+p2.y)/2 - 4);
});
}

/* ---------- hover trace ---------- */
function clearTrace(){
canvas.classList.remove("tracing");
wireEls.forEach(function(we){ we.path.classList.remove("hot"); we.lbl.classList.remove("hot"); });
cards.forEach(function(c){ c.classList.remove("linked"); });
}
function traceCard(id){
canvas.classList.add("tracing");
wireEls.forEach(function(we){
if(we.edge[0]===id || we.edge[1]===id){
we.path.classList.add("hot"); we.lbl.classList.add("hot");
var other = we.edge[0]===id ? we.edge[1] : we.edge[0];
if(cardById[other]) cardById[other].classList.add("linked");
}
});
if(cardById[id]) cardById[id].classList.add("linked");
}
function traceType(type){
canvas.classList.add("tracing");
wireEls.forEach(function(we){
if(we.edge[2]===type){ we.path.classList.add("hot"); we.lbl.classList.add("hot"); }
});
}
cards.forEach(function(c){
c.addEventListener("mouseenter",function(){ traceCard(c.id); });
c.addEventListener("mouseleave",clearTrace);
c.addEventListener("click",function(){ openInspector(c.id); });
});
Array.prototype.forEach.call(document.querySelectorAll("#legend .li"),function(li){
li.addEventListener("mouseenter",function(){ traceType(li.dataset.type); });
li.addEventListener("mouseleave",clearTrace);
});

/* ---------- inspector ---------- */
var insp = document.getElementById("insp");
function tagClass(t){
// ADAPT: only the structural tags get a colour; any other project-specific
// tag (SEO, EMAIL, DATA, CREATE, ...) falls back to the neutral base .tag style.
var m={ADMIN:"tag-admin",PROTECTED:"tag-protected",PUBLIC:"tag-public",AUTH:"tag-auth",
API:"tag-api",DEV:"tag-dev"};
return m[t]||"";
}
function openInspector(id){
var c = cardById[id]; if(!c) return;
document.getElementById("iRoute").textContent = c.dataset.route;
document.getElementById("iMeth").textContent = "METHOD  ·  " + c.dataset.method;
document.getElementById("iFile").textContent = c.dataset.file;
document.getElementById("iDesc").textContent = c.dataset.desc;
var tg = document.getElementById("iTags"); tg.innerHTML="";
(c.dataset.tags||"").split(",").filter(Boolean).forEach(function(t){
var s=document.createElement("span"); s.className="tag "+tagClass(t.trim()); s.textContent=t.trim(); tg.appendChild(s);
});
var conn = document.getElementById("iConn"); conn.innerHTML="";
var found=false;
EDGES.forEach(function(e){
var dir=null, other=null;
if(e[0]===id){ dir="out →"; other=e[1]; }
else if(e[1]===id){ dir="in ←"; other=e[0]; }
if(dir){
found=true;
var a=document.createElement("a");
a.innerHTML='<span class="dir">'+dir+'</span>'+ (cardById[other]?cardById[other].dataset.route:other) + (e[3]?' <span class="dir">· '+e[3]+'</span>':'');
a.addEventListener("click",function(){ openInspector(other); traceCard(other); });
conn.appendChild(a);
}
});
if(!found) conn.innerHTML='<span class="empty">no connections traced</span>';
insp.classList.add("open"); insp.setAttribute("aria-hidden","false");
}
/* single shared close path — keeps the visual state (.open) and the
accessibility state (aria-hidden) in sync for EVERY close trigger.
Never split this back into separate handlers. */
function closeInspector(){
insp.classList.remove("open"); insp.setAttribute("aria-hidden","true");
}
document.getElementById("inspClose").addEventListener("click",closeInspector);
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeInspector(); });

/* ---------- draw timing (robust against fonts / layout shifts) ---------- */
draw();
window.addEventListener("resize", draw);
window.addEventListener("load", draw);
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(draw); }
if("ResizeObserver" in window){ new ResizeObserver(draw).observe(canvas); }
setTimeout(draw,120); setTimeout(draw,500);

/* ---------- smooth nav + reveal ---------- */
document.querySelectorAll('nav.tabs a').forEach(function(a){
a.addEventListener("click",function(ev){
var t=document.querySelector(a.getAttribute("href"));
if(t){ ev.preventDefault(); t.scrollIntoView({behavior:"smooth",block:"start"}); }
});
});
if("IntersectionObserver" in window){
var io=new IntersectionObserver(function(es){
es.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target);} });
},{threshold:.12});
document.querySelectorAll(".reveal").forEach(function(el){ io.observe(el); });
} else {
document.querySelectorAll(".reveal").forEach(function(el){ el.classList.add("in"); });
}
})();
</script>
</body>
</html>
```

---
## ⛔ FINAL REMINDER — same gate as the top of this file
Once loaded, follow these steps:
1. **Analyze** the project with the 9-step checklist. Parallel file-pickers/code-searchers; read key files.
2. **Produce `spec.json`** per the schema — every route (with its `links`), table, column, component, store, server lib, integration, business rule, env var. It must stand alone: another agent reading only `spec.json` can find the right file and make a correct change without re-scanning.
3. **Produce `map.html`** — copy the CSS and JS blocks verbatim from the template; build Section 01 topology from `spec.json → topology.zones` (plain flexbox zones/columns — no manual coordinate math); flatten `routes[].links` into the `EDGES` array; fill Sections 02–05 straight from the matching `spec.json` arrays per the ADAPT comments — iterating each array in full, one pass, never by eye.
4. **Validate before finishing — all three checks, mechanically:**
   (a) **Interactivity** — open `map.html` in a browser: topology interactive (hover = trace wires, click = inspector drawer, Escape AND the ✕ button both close the drawer — and after EITHER trigger the `<aside class="insp">` carries `aria-hidden="true"`; both share the one `closeInspector()` function), all 5 sections render, every `EDGES` entry references two ids that exist as `.rcard` elements on the page.
   (b) **Completeness** — cross-check rendered cards against `spec.json` with grep, never by eye (one match per card):
   - `grep -c 'class="rcard' map.html` == `routes[]` length
   - `grep -c 'class="ccard' map.html` == `components[]` length; `grep -c 'class="ccard dorm' map.html` == dormant count — so live cards (total − dormant) == number of `status:"live"` entries, and the printed "N live · M dormant" equals exactly that
   - `grep -c 'class="scard' map.html` == `stores[]` + `serverLibs[]` lengths combined
   - `grep -c 'class="tcard' map.html` == `database.tables[]` length
   - `grep -c '<div class="r">' map.html` == `database.relationships[]` length
   - `grep -c 'class="envrow' map.html` == `environmentVariables[]` length
   - `grep -c 'class="stk' map.html` == `stackItems[]` length
   Every printed count (sheetmeta, statrow, sec-sub) must match the arrays exactly. Fix any drift — a card dropped or a stale tally is a failed validation.
   (c) **Secrets + escaping** —
   - For EVERY literal secret value discovered in the codebase (each one logged in `businessLogic.security_notes`): `grep -F -- '<value>' .plan/spec.json .plan/map.html` MUST return zero matches — only the redacted wording may remain in either file.
   - `grep -nE 'data-(route|method|file|desc|tags)="[^"]*<' map.html` MUST return nothing (no unescaped `<` inside any attribute value).
   - No raw placeholder token (`<folderName>`, `<fileName>`, any `<word>`) may survive in visible card text — check the HTML source, not the rendered page.
