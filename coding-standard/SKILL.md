---
name: coding-standards
description: Universal coding standards for any language/framework. Use when writing, reviewing, or modifying ANY code. Core file defines workflow gates and principles; stack-specific idioms load from stack profiles (references/).
category: engineering
---

# Universal Coding Standards (Language-Agnostic)

## 🚫 HARD GATE — READ FIRST. Violating this gate voids the skill.

Before writing or modifying ANY code, you MUST:

1. Read this ENTIRE file top to bottom. Every plan item must already reflect these conventions.
2. Produce a structured ARCHITECTURE PLAN (§1) whose atomic tasks each cite the specific convention(s) they must follow.
3. Write that task list to `.plan/todo.md` (§4 format, every item `- [ ]`) DURING planning — before approval. This is the ONLY file-write permitted before "ok proceed".
4. Present the plan as your ENTIRE response. Nothing else.
5. STOP. End your turn. Approval is a mechanical check on the user's next message: it grants permission ONLY if that message contains the literal string `ok proceed` (case-insensitive). Nothing else grants it — see Approval rules below.
6. Do NOT call any source-file write tool (`patch`, `write`, `edit`, `create_file`, `delete_file`, or equivalent) before approval. Read-only tools (`search_files`, `view`/`read`) and the single `.plan/todo.md` write are allowed during planning; nothing else.
7. If your next action before approval would be a source-file write — stop. That is the gate firing. Do not make the call. If you catch yourself writing reasoning like "this counts as approval" — that sentence IS the gate firing. Stop.

Once a message containing the literal `ok proceed` arrives: implement tasks in order from the already-written `.plan/todo.md`, flipping each checkbox to `- [x]` as completed (§4). Do not re-write or re-plan the list. Implementation stays inside the Execution scope lock below.

First line of your response MUST be exactly: `PLAN MODE — plan only, no file-write tools until "ok proceed".` — repeat it as the first line of EVERY response until approval arrives.

### Approval rules — mechanical, no interpretation:
- The check is a literal string search for `ok proceed` in the user's latest message. Match → approved. No match → NOT approved. There is no other approval signal.
- ❌ Implicit approval does not exist. The following reasoning is banned — do not think it, do not write it: "ok proceed is implicitly given", "the user addressing/responding to the plan counts as approval", "I'll take this as approval", "effectively/essentially approved", "since the user replied I may proceed".
- These are NOT approval: "yes", "go ahead", "do it", "sounds good", "lgtm", "perfect", questions, revisions, added requirements, compliments, new requests — in any language or phrasing.
- Any follow-up that is not approval is plan feedback: incorporate it, rewrite the task list in `.plan/todo.md` if it changed (still the one permitted write), re-present the revised plan, and wait again for literal `ok proceed`. The gate fully resets on every revision.

### Execution scope lock — after approval:
- After "ok proceed" you may create, modify, or delete ONLY files listed in the approved plan's File/folder plan (§1.1). Every unlisted file is frozen — read-only.
- If implementation reveals a change is needed in an unlisted file — STOP. Propose it as a plan-revision addition and wait for approval again. Expanding scope on your own is a gate violation.

### Destructive operations — zero assumption:
- `delete_file` / rename / move of any source file is BANNED unless that exact path appears in the approved plan explicitly flagged `DELETE:` or `RENAME:` (§1.1). Nothing else authorizes it.
- Before executing any deletion/rename, state it inline: `Destructive op — <path>: authorized by T-<n>.<k> of the approved plan.` An unstated destructive op is unauthorized.
- ❌ Banned reasoning: "this file looks unused/duplicate/dead/legacy, so I'll remove it." Dormant files may be referenced by dynamic imports, config, cron jobs, or external services. When in doubt: comment out or deprecate — never delete.

### Exception — resuming:
If the user's message is exactly `continue` (case-insensitive, standalone) AND the latest list in `.plan/todo.md` has an unchecked `- [ ]` item, skip this gate. That list was already approved. Run §0, then resume from the next unchecked item — no new plan, no "ok proceed" needed. `continue` is ONLY this resume path — it never approves a new plan.

## Overview

Refer to the rules outlined here verbatim when addressing architectural implementation patterns. This core file is **language- and framework-agnostic**: it defines workflow gates, planning discipline, and engineering principles. Concrete syntax, commands, and idioms come from the active **Stack Profile** (§Stack Profiles).

## Stack Profiles (pluggable)

A stack profile is a reference file that adapts this skill's generic rules to a concrete stack. Before planning:

1. Identify the project's stack from `.plan/spec.json`, manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`, `pom.xml`, …), or a minimal scan.
2. Load the matching profile if one exists (e.g. `references/svelte-kit.md`, `references/django.md`, `references/rails.md`).
3. If no profile exists, fall back to this file's generic conventions **plus the project's existing patterns** — imitate established style; never invent a divergent one.

Every profile MUST define (or explicitly defer to this file):
1. File header format — path comment + instructions header, in the language's comment syntax.
2. Import/module ordering.
3. State-management idioms (client reactivity; server statelessness rules).
4. Form submission & server-action pattern (validate → error handling → success shape).
5. List-rendering keying rules.
6. Input binding rules for server-seeded editable fields.
7. DB layer: ORM/driver, mutation-verification method, post-write sync step (if any).
8. API route conventions + external-endpoint auth.
9. Verification commands: autofixer (if any), typecheck/lint, build.
10. UI framework / design system and its docs source.

## Loading Rules

- ALWAYS load this skill before writing code.
- ALWAYS check `.plan/spec.json` and `.plan/todo.md` before scanning the codebase or drafting a plan (§0).
- ALWAYS load the stack profile for the detected stack; if the profile defines an autofixer tool (e.g. an MCP autofixer), run it on every applicable modified file before sending code.
- Prefer Context7 MCP for library/framework docs (UI kits, ORMs, CSS frameworks) over local `.txt` files.

## Mandatory Pre-Task Workflow (AUTO-EXECUTE every prompt)

### 0. Context & Resume Check

Check `.plan/` first — cheaper than re-scanning the codebase.

**`.plan/spec.json` (fast index):**
- If it exists, read it. It is the primary source for routes, components, stores/modules, server libs, DB schema, auth, business logic, env vars. Do NOT re-scan the codebase to rediscover what it already gives. Open named files only when a task needs exact current code.
- If missing, run the `app-map` skill to generate it first (or an equivalent lightweight scan writing the same schema).

**`.plan/todo.md` (project memory):**
- Read the whole file before drafting any plan. Its content is: any in-progress list plus the rolling summaries (`### Summary — General` + the 2 most recent individual summaries) — the summaries hold every gotcha/pitfall/bug ever logged. Completed checklists are deleted once summarized; the summaries ARE the history.
- Carry every applicable gotcha/pitfall/bug from the summaries into the new plan as a written Known constraints checklist (§1.0). A gotcha not written there never gets checked later.
- If an in-progress list still has an unchecked `- [ ]`: prior session was interrupted.
  - Message is exactly "continue" → Hard Gate exception: resume from next unchecked item.
  - New request while an incomplete list remains → MANDATORY notice before anything else, e.g. `Note: T-6 is still incomplete (4/7 done) — say "continue" to resume, or I'll proceed with this new request instead.` Never append a new list silently over an unmentioned incomplete one.
- An incomplete list is NEVER marked abandoned/superseded/closed by the agent on its own initiative. See §4 for the only two ways a list closes.
- Count `### Summary — T-<n>` blocks (excluding `### Summary — General`). If more than 2, fold down to 2 (§4 self-heal) as the FIRST write of the session, before any plan.
- If the file doesn't exist, it is created during planning (Hard Gate step 3).

### 1. Planning & Task List

Produce a structured ARCHITECTURE PLAN. No code, no file-write tools while producing it. Exclude `.gitignore` paths from codebase reading. Read this skill in full first so the plan is standards-compliant from the start. The plan MUST cover:

- **Known constraints** — every applicable gotcha/pitfall/bug from `.plan/todo.md` summaries, written as its own checklist. If none apply or no file exists, state that plainly — never omit the section. §3's diff check holds every edit against this list.
- **File/folder plan** — every file created/touched: path, one-line purpose, specific conventions applying to it. Files to be DELETED or RENAMED must be flagged `DELETE: <path>` / `RENAME: <old> → <new>` — approval covers destructive ops ONLY through these flags (Hard Gate → Destructive operations). Flag any new server actions or API routes.
- **Cross-page impact** — run the §2 search; include a "Pages checked" list naming each inspected file and safe/affected status.
- **Data flow (if writing/validating data)** — trace origin → validation → write points; note every place the same rule/shape is enforced twice; for shared schemas name exact field/type pairs and the single file both client and server import.
- **Verification gates** — per file: profile autofixer (yes if the profile defines one for that file kind) and project typecheck/lint (yes only if type/logic-relevant — executable logic, handlers, shared types, schema; no for markup/class/copy-only edits, §3). Do NOT plan the project build command unless adding a dependency or touching build/adapter config.
- **New dependencies / design-system classes** — list them; flag which need a Context7 lookup.
- **Convention compliance checklist** — per-file rows for whichever apply: File Path Comment, File Instructions header, create-action `new*` naming, single unified submit handler, server-action pattern (validate → try/catch → verify → sync), API auth for external endpoints, keyed iteration, two-way binding for editable inputs, derived-over-effects placement. Only rows relevant to touched files (profile may add stack-specific rows).
- **Responsive & Cross-Device Check** — for any frontend/UI changes.
- **Risks** — anything that could desync frontend/backend or need different handling across clients/platforms.
- **Assumptions & Questions for Confirmation** — educated assumptions may shape the PLAN DRAFT, but ALWAYS end with a dedicated bulleted list of clarifying questions. Tasks depending on an unconfirmed assumption are flagged `[needs confirmation]` in the todo list — implementation STOPS at such a task and asks; it never proceeds on an assumption.

Break everything into atomic todo items citing their conventions. Write that exact list to `.plan/todo.md` now (§4 format, all `- [ ]`) — planning output, the one allowed write. Then present the plan, STOP, wait for literal "ok proceed". Do NOT write component/server/schema code in the plan response.

DO ask for `.env` values when needed.
DO end the reply with exactly: `Review this plan — do not implement yet.`

### 2. Cross-Page Impact Analysis (MANDATORY)

Before modifying any page/view, route handler, controller, or API endpoint file:

- `search_files` for key field names (e.g. `user`, `product`) across the entire routing/handler tree — RECURSIVELY, into all nested route folders — to find every consumer. Read-only — allowed during planning.
- Specifically check: does another page read the same data fields being changed/removed/renamed? Query the same tables? Does a UI change affect form data submitted to a shared server action?
- Document results in the plan's "Pages checked" section.

### 3. Post-Change Verification

**Diff check — run FIRST on EVERY edit, no exceptions:**
- Immediately after writing/patching a file, run `git diff -- <file>` (or diff held pre-edit vs post-edit content if not a git repo). Read the actual diff — never rely on memory.
- Scan every `-` line for removed comments (in ANY comment syntax for the language: `//`, `/* */`, `<!-- -->`, `#`, `--`, etc.). Any found → Comment Preservation violation: restore before moving on.
- Cross-check `-`/`+` lines against every item in this plan's Known constraints. Any contradiction → fix in the same tool-call cycle.
- State the result inline per file: `Diff check — <file>: no comments removed, no known-constraint violations.` A file write with no stated result is unverified.
- Runs on EVERY edit, including markup-only — those most often silently drop comments.

**Tooling:**
- Run the profile's autofixer on every modified file of the kind it covers, before sending code — cheap, single-file, always.
- Run the project's typecheck/lint only when the change is type/logic-relevant: executable logic, handlers, shared types, DB schema. Skip for markup/class/static-copy-only edits. Examples (profile names the exact commands): JS/TS `tsc --noEmit`/`npm run check`, Python `mypy`/`ruff check`, Go `go vet`, Rust `cargo clippy`.
- Batch typecheck/lint across several small type-relevant tasks — run once after the batch, unless one task touches a shared type/schema and needs an isolated check first.
- Do NOT run the full project build routinely. Reserve for new dependencies, build/adapter config changes, or pre-deploy.
- Confirm zero NEW errors (pre-existing errors acceptable but must be called out).

### 4. Persist Progress — `.plan/todo.md`

The list is written during planning (Hard Gate step 3); by "ok proceed" it already exists with all items `- [ ]`. This section is maintaining it.

**Append-only.** Only in-place edits allowed: flipping a task's own checkbox, marking a task (or, only on explicit user instruction, a whole list) `- [~]`, deleting a just-completed list's checklist after its Summary is written, deleting an abandoned list's task lines (its `- [~]` header line stays), folding an aging summary into General. Nothing else is ever rewritten.

**IDs:** highest `T-<n>` referenced anywhere in the file + 1 for a new list (start `T-1` if new/empty) — check the General header range, individual summaries, and `⚠ REPEATED` lines. IDs are never reused. Each task gets `T-<n>.<k>`.

**New list format:**

    ## Todo List T-<n> — <short title> — <YYYY-MM-DD>
    Request: <one-line restatement>
    - [ ] T-<n>.1 — <atomic task> (convention: <cited convention(s)>)
    - [ ] T-<n>.2 — <atomic task> (convention: <cited convention(s)>)

**Checkbox flips are immediate:** the instant a task finishes, flip `- [ ]` → `- [x]` in the same turn, before the next task, and state it inline: `Todo update: T-6.3 → [x].` A done-task with no flip is not recorded.

**Abandoned task:** mark `- [~] <task> — superseded by T-<n>.<k>: <reason>` — never delete.

A whole list closes exactly two ways: all items reach `[x]` (completion flow below), or the user explicitly says to drop it → mark its header `- [~] List abandoned by user request: <reason>` and delete its task lines (the `- [~]` header line is the only record kept — no summary is written for abandoned lists). The agent NEVER abandons/supersedes/reserves a list on its own — not to tidy up, not to route around a mistake, not because a new request seems more relevant. A blank-placeholder ID with a quietly started new list is the same violation. See §0 for the mandatory notice.

**On full completion** (every item `[x]`), in the same turn, before any new request:

Append the summary (never summarize a partially completed list):

    ### Summary — T-<n>
    - What changed: <files touched, structural changes>
    - Gotchas / pitfalls: <non-obvious things that cost time or could trip up a future agent>
    - Bugs hit & fixes: <bug → root cause → fix>

- Any Known-constraints item violated during implementation — even if self-caught — gets its own line: `⚠ REPEATED: <constraint> — violated again in T-<n>, fixed by <fix>`. Never fold into prose; never drop or soften during folding (only merge with other `⚠ REPEATED` lines for the *same* constraint).

Delete the done checklist entirely — header and every `- [x]` line. The Summary is now the only record of that list, and it carries everything that matters (what changed, gotchas, bugs). Keeping checked-off task lists or collapsed one-line records is pure token waste. Never delete the current in-progress list.

**Enforce the summary bound — every completion, no skipping:** count `### Summary — T-<n>` blocks (excluding General; the one just written counts). If more than 2, fold the oldest into `### Summary — General (T-1..T-<k>)` — dedupe, but keep every distinct gotcha/pitfall/bug — until exactly 2 individual summaries remain. State inline: `Summary bound check: 3 individual (T-9, T-10, T-11) → folded T-9 into General → now General + T-10, T-11.` If within bound, still state it: `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced.

**The bound:** at most 3 detailed summary blocks ever — one `### Summary — General (T-1..T-<k>)` plus the 2 most recent individual summaries. The summaries ARE the project memory — gotchas, pitfalls, and bugs are what matter. Folding shortens the file; it NEVER discards a warning.

**Self-heal on read:** if the §0 read shows more than 2 individual summaries, folding down to 2 is the FIRST write of the session — before any plan write.

### 5. Keep `.plan/spec.json` in Sync

Check after every completed task, in the same turn its checkbox flips — never deferred to the end.

**The test:** did this task change a shape `spec.json` tracks — route, DB schema (tables/columns), component file, module/store, server lib, integration, env var, auth rule, or business logic (validation rule, permission/auth check, pricing/eligibility rule, business constraint)? Logic is NOT exempt — the test is tracked-shape change, never "styling vs logic".

**Applies:** any new/removed/changed tracked shape — anything a future agent would need `spec.json` to know instead of re-reading the code.

**Does not apply:** changes with no observable difference in app behavior or structure that spec.json tracks (CSS/class swaps, copy edits, debug logging, inline UI with no new file/behavior, pure internal refactors).

When it applies: patch only the affected entries — never regenerate the file or re-run a full `app-map` scan.

State the result inline for every task, whichever branch applies — with the actual reason for that specific task, not a stock phrase. A task with no stated spec.json line is unverified.

## Key Rules

- **Comment Preservation (non-negotiable):** NEVER delete an existing comment — they are references, including dormant/commented-out boilerplate kept for future forks. Checked mechanically via §3's diff check, never by memory. If one truly must go (factually wrong after a change), say so explicitly and get user confirmation first — never remove silently.
- **No destructive assumptions (non-negotiable):** NEVER delete/rename/move a file because it "looks" unused/duplicate/dead/legacy — deletion requires an explicit `DELETE:` entry in the approved plan (§1.1) plus the inline statement before executing (Hard Gate → Destructive operations). When in doubt, comment out or deprecate. Files get the same preservation discipline as comments.
- Prefer Context7 MCP for framework/library docs over local `.txt` files.
- Always run the profile's autofixer (when defined) before sending code.
- Use the framework's idiomatic, modern reactivity/state primitives; prefer derived/computed state over side-effectful watchers.
- NEVER create global mutable/reactive state in server-side modules — server code must be stateless per-request to prevent cross-client leaks. Exception: huge read-only data reused across all users (e.g. static reference datasets).
- Editable inputs seeded from server-loaded data must use two-way binding (or local state that round-trips), never display-only one-way binding, wherever the framework distinguishes them.
- Every loop over a dynamic/mutable collection in rendered UI needs a unique stable key — never the loop index.
- One unified form-submission handler per page/view handles ALL submissions and notifications — no per-form handlers (where the profile uses enhanced/progressive forms).
- Actions creating new records are named `new*` (e.g. `newAccount`) — a cross-stack convention.
- Server actions/handlers: validate input → try/catch around the mutation → verify the mutation succeeded → run the profile's post-write sync step (if defined) → return a consistent success/failure shape.
- API routes: protect externally-triggered endpoints with shared secrets.
- Helpers live in the project's designated shared utility modules (one client-side, one server-side) — check and reuse before writing new. Multi-use utilities are single shared exports — never redefined inline.
- **File Path Comment:** every source file starts with a comment stating its relative path, in the language's comment syntax (e.g. `// src/routes/api/download/+server.ts`, `<!-- src/components/Modal.svelte -->`, `# app/services/billing.py`).
- **File Instructions header:** at the top of every component/module/handler file (before logic/markup), a comment block with usage instructions and important notes. For server handlers: what triggers it, auth requirements, non-obvious assumptions (expected schema fields, external payload shapes).
- **Code safety:** all direct DB queries and calls to secure external APIs happen in server-side code — never in client-rendered code.
- No empty catch blocks (or language equivalent).
- NO `[cite_start]` or any citation text inside code blocks.
- Code fences in responses MUST specify the correct language identifier for the code inside.
- Prefer the language's immutable declaration idiom (`const` or equivalent) for function definitions and exports.
- NEVER include API keys/tokens/passwords/credentials — write `[REDACTED]`.

## Frontend Conventions (generic — profile supplies syntax)

### Imports order
1. Environment/config modules
2. Language/framework core
3. Third-party packages
4. Project modules/components
5. Icon/asset libraries (last)

### Props
Declare/destructure props idiomatically; derive computed values from props rather than duplicating them into separate state.

### Page structure
- Set the document/page title in the head for every page.
- Provide a no-JS fallback (e.g. `<noscript>` block above main content) wherever the UI depends on JavaScript, hiding the interactive shell and showing an enable-JS message.

### Modal and UI State Management
- Standardized modal state fields: current modal type, current object, open flag, title, and the target server-action route (or profile equivalents).
- One dispatcher (`onClickModal`-style) that: resets fields → sets modal type/object → opens → sets action route and title per type.
- Every page defines ONE reset function (`onResetFields`) resetting every form-related state field to initial values. Called from the modal dispatcher (before setting new state) and from the submit handler's `finally`.
  - **Exception — named partial resets:** only when logic genuinely requires clearing a subset (independent sub-form, search/filter block): define a separately named function, each resetting a complete, clearly scoped group — never a single field, never scattered inline resets. Not a shortcut to avoid the main reset function, which still owns all remaining fields.
- Modal/overlay markup ALWAYS at the bottom of the page markup, gated by a state check.

### Form submissions
- ONE submit handler per page handles ALL form submissions and notifications. Never separate per-form handlers.
- Every server action returns a unique `action` string in its result; create actions start with `new`.
- Every form uses the framework's progressive-enhancement mechanism bound to the single handler — never an ad-hoc call.
- Update reactive state inside the per-action branches when needed.
- Handler structure: set loading → await framework update → branch on success (dispatch by `action`, notify), failure (notify with message), error (notify), redirect (navigate) → `finally`: reset fields, refresh local copies of server data, clear loading.

### Keyed iteration
Every loop over dynamic/mutable arrays in UI MUST have a unique key; NEVER the loop index (causes DOM state bugs on reorder/delete). Omit key only for fully static, hardcoded arrays.

### Editable input bindings
Any editable input sourced from server-loaded data MUST bind two-way to local state seeded from that data.

**Why:** enhanced form submission typically calls native form reset on success, resetting fields to `defaultValue` (baked at first render). One-way display bindings never update that default, so fields silently revert to stale data even after data invalidation. Two-way binding makes field state the source of truth. Plain display-only binding is for genuinely read-only content only.

### Derived vs effects/watchers
(Canonical definition of this rule — stated only here; other sections reference it.)
- Favor derived/computed state over effects/watchers.
- Effects only when necessary (e.g. reacting to data reloads). Usually exactly ONE per page/component. Multiple allowed only if combining would cause interference (one effect's dependency retriggering unrelated logic).
- Every effect sits at the BOTTOM of the script block, below the submit handler if one exists.

## Backend Conventions (page/route handlers)

### Structure
- Environment/config imports explicitly at the top.
- All constants, helpers, and DB instantiations after imports, before handlers.
- Read/load handler defined per framework convention.
- All mutating actions grouped together at the bottom of the handler module.

### Server Actions Pattern
1. Fetch/parse request form data.
2. Validate required fields → 400 failure if missing.
3. Wrap DB mutations (insert/update/delete) in try/catch.
4. Verify the mutation succeeded (inserted ID or affected-row count per the profile's DB layer) → 500 failure if not.
5. Await the profile's post-write sync step (if defined).
6. Return: `{ action: 'actionName', success: true, message: 'Success message' }`
7. Catch returns: 500 failure with `{ action: 'actionName', success: false, message: 'Failed to ...' }`

Create actions named `new*` — consistent with the frontend submit handler.

## API Route Conventions

Applies to every API endpoint file.

- Imports: same order as server handlers.
- Variables/helpers: after imports, before exported handlers.
- Handlers: one definition per supported HTTP verb. If two verbs share identical logic (e.g. cron via GET or POST), define one handler function and assign to both.
- **Auth for external endpoints:** anything called by non-app code (cron, webhooks, third-party callbacks) MUST check a shared secret via header/query param, returning 401 on mismatch. Never leave open.
- DB ops: try/catch; on failure use the framework's error response (500) — never a bare unstructured response. Await the post-write sync step after successful mutations.
- Responses: structured JSON with a consistent, predictable shape (e.g. `{ success, found, sent, failed }`).
- File Path Comment and File Instructions header apply here as everywhere.

## Template & Directory Structure

- Follow the project's existing layout/route-group structure. Where the framework supports named layout groups (e.g. parenthesized groups that don't affect URLs), respect them; components exclusive to one layout live in that layout's component namespace, shared ones in the shared namespace.
- Typical patterns: dashboard layout with sidebar, app layout with navbar, auth/login layout with no navigation.
- All API endpoints live under the project's API route root.

## Storage & Assets

- Local database files live in the project's designated data directory.
- Dynamic files (user/app uploads, generated files) live in a runtime-writable uploads directory that is NOT part of the static build (unlike static asset directories).

## Deep Nested Routing

- Routing may be folder-based and deeply nested, or config-based — search RECURSIVELY into child folders; never stop at the routes root.
- Layout/route groups in the framework's grouping syntax organize files without affecting URLs.
- Dynamic params use the framework's param syntax.
- Always map the URL to its exact handler/view files, and dig to the paired view + server-handler files.

## UI/UX

- Use the project's design system (component library + CSS framework) — craft visually stunning UIs.
- Consult design-system docs via Context7 MCP.

## Database Integration

- Use the project's configured data layer (SQL via ORM — e.g. Drizzle/Turso/LibSQL — or document DB — e.g. Mongoose). The stack profile defines exact query, migration, and sync conventions.

## State Management

- Favor the framework's modern state primitives over legacy store APIs.
- Universal cross-component client state lives in the project's designated shared state module(s); read-only shared data in a separate data module.
- Effect cardinality & placement → Frontend Conventions → Derived vs effects/watchers (defined there only).
- Server-side state → Key Rules (no global reactive state in server modules; defined there only).

## ⛔ FINAL REMINDER — same gate as the top of this file

Before your next tool call:

1. If it is a write to a source file (`patch`, `write`, `edit`, `create_file`, any file-mutating tool) and the user's latest message does NOT contain the literal string "ok proceed" — STOP. Do not make that call. There is no implicit approval — a follow-up is feedback, not permission. The one permitted pre-approval write is `.plan/todo.md` itself, during planning.
2. If it is a write to ANY file not listed in the approved plan's File/folder plan — STOP. Scope never self-expands; propose a plan revision instead.
3. If it is `delete_file` / rename / move — STOP unless that exact path is flagged `DELETE:` / `RENAME:` in the approved plan AND you state `Destructive op — <path>: authorized by T-<n>.<k>` inline first. Never assume a file is unused/dead/duplicate.

Only exception to (1): a message that is exactly "continue" while `.plan/todo.md` still has an unchecked `- [ ]` item — for that incomplete list only.
