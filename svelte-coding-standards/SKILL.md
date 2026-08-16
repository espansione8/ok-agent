---
name: svelte-coding-standards
description: Universal Svelte 5 / SvelteKit coding standards. Use when writing, reviewing, or modifying ANY Svelte code.
category: svelte
---

# Svelte 5 / SvelteKit Coding Standards

Refer to the rules outlined here verbatim when addressing architectural implementation patterns. Never over-engineer - write the minimal functional solution following strict YAGNI principles, terse and secure, no verbose explanation unless asked.

## Loading Rules

Always load this skill before writing Svelte code. Always check `plan/spec.json` and `plan/todo.md` before scanning the codebase or drafting a plan. Always run `mcp__svelte__svelte_autofixer` before sending Svelte code. Domain references bundled with this skill: `references/svelte-ai-prompts.md` (Svelte MCP prompts), `references/drizzle-orm-turso-libsql.md`, `references/mongodb-mongoose.md`.

## 🚫 Hard Gate - plan, approve, then implement

Before writing or modifying any Svelte code:

1. Read this file in full - every plan item must already reflect these conventions.
2. Produce the 10-section ARCHITECTURE PLAN below, hyper-atomic tasks each citing the convention(s) they follow.
3. Write that task list to `plan/todo.md` (Todo Protocol format, every item `- [ ]`) - the only write permitted before approval. One request = one list, always; a revision edits the same pending list in place under the same `T-<n>` ID - it never appends a second list or takes a new ID.
4. Present the plan as your entire response: the 10 sections and the full task list, task list MUST be on screen. First line exactly: `PLAN MODE - plan only, no file-write tools until "ok proceed".`
5. Stop. End your turn.

**Approval - a printed check, not a recalled rule.** Before ANY write-tool call (`patch`, `write`, `edit`, `create_file`, `delete_file`, or equivalent), print:

```
Approval check: user's last message = "<verbatim, trimmed>" | exact match to "ok proceed" (case-insensitive, standalone)? YES/NO.
```

- **YES** → implement tasks in order from `plan/todo.md`, flipping checkboxes `- [x]` as completed. Do not re-plan.
- **NO** → the next line must be `→ NOT approved - treating as plan feedback.` No write call follows in that turn, under any framing - "the user seems fine with it," "this is basically approval," and similar reasoning are exactly what this printed check exists to block. Update the same pending list in `plan/todo.md` in place, re-present the full plan, wait again. This mechanism is deliberately mechanical and model-agnostic: only on printing and acting on a literal string comparison.
- No other approval signal exists. "yes / go ahead / do it / sounds good / lgtm", questions, revisions, new requests, or `ok proceed` embedded inside other text are all NOT approval.
- **Exception:** message is exactly `continue` (standalone) and `plan/todo.md` has an unchecked `- [ ]` item in an already-approved list → skip the gate, run the Interrupted-session check below, resume from the next unchecked item. `continue` never approves a new plan.

**Execution scope lock.** After "ok proceed", touch only files listed in the approved File/folder plan. An unlisted file needs a change? Stop, propose a plan revision, wait for approval again - scope never self-expands.

**Destructive ops - zero assumption.** `delete_file`/rename/move is banned unless that exact path is flagged `DELETE:`/`RENAME:` in the approved plan. Before executing, print: `Destructive op - <path>: authorized by T-<n>.<k>.` A file "looking" unused, dead, or duplicate never authorizes deletion on its own - it may be reached by dynamic imports, cron jobs, or external callers invisible to a static read; comment out or deprecate instead.

## Plan Sections (10, required every time)

Producing the plan: no code, no file-write tools. Exclude `.gitignore` paths from codebase reading. One line per fact - not applicable → `N/A.`; empty category → `None.` Never justify an `N/A` or restate what's unchanged; the word already says it. Ask for `.env` values when a task needs them. End the reply with exactly: `Review this plan - do not implement yet.`

1. **Known constraints** - the sentinel item first, always, then every applicable master-list gotcha from `plan/todo.md`. Nothing else applies → sentinel alone.
2. **File/folder plan** - `path - purpose (convention: X, Y)`. Files to be deleted/renamed flagged `DELETE: <path>` / `RENAME: <old> → <new>`; flag new server actions/API routes.
3. **Cross-page impact** - run `search_files` for key field names (e.g. `user`, `product`) across all of `src/routes/`, recursive, to find every consumer. For each: does another page read the same `data` fields being changed/removed/renamed? Query the same tables? Does a UI change affect form data submitted to a shared server action? One line per inspected file: `file - safe` or `file - affected: <why>`.
4. **Data flow** - only when writing/validating data: `field → validation → write point`; spots where the same rule is enforced twice; shared schema field/type pairs + the one file both sides import. Otherwise `N/A.`
5. **Verification gates** - `path - autofixer ✓ · check ✓` (`check ✓` only when type-relevant: script logic/props/events, `+page.server.ts`/`+server.ts`, shared type, schema; markup/class/copy-only → `check -`). Plan `npm run build` only for new dependencies or `vite.config`/adapter changes.
6. **New dependencies / DaisyUI classes** - list, flag Context7 lookups. Otherwise `None.`
7. **Convention compliance checklist** - only rows touching this task: Route Path Comment, Component Instructions header, `formSubmit`/`new*` naming, single `$effect` at script bottom, Server Actions Pattern, API auth, `{#each}` keying, `bind:value` vs `value`.
8. **Responsive & cross-device check** - any `.svelte` change: one line on how it's verified. Otherwise `N/A.`
9. **Risks** - frontend/backend desync, cross-platform handling. Otherwise `None.`
10. **Assumptions & open questions** - one number each after full task list. A task depending on an unconfirmed assumption is flagged `[needs confirmation]` in the todo list - implementation stops there and asks, never proceeds on an assumption. Otherwise `None.`

## Todo Protocol - `plan/todo.md`

Read the whole file before drafting any plan.

**Layout, fixed order top to bottom:**
```
### Gotchas & Bugs - master list (read first)
- (ALWAYS) Apply svelte-coding-standards in full - hard gate, plan/todo.md first, exact "ok proceed" approval, scope lock, destructive-op flags.
- (T-<n>) <gotcha, or bug → root cause → fix>
### Summary - General (T-1..T-<k>)
- T-<n> - <one line>
### Summary - T-<n> - <one line>
### Summary - T-<n+1> - <one line>
## Todo List T-<n+2> - <title> - <YYYY-MM-DD>
Request: <one line>
- [ ] T-<n+2>.1 - <hyper-atomic task> (convention: <cited convention>)
```

- **Master list** - every gotcha/bug ever logged lives here, permanently, and only here. The sentinel item is never deleted, folded, or reworded. New entries append on list completion, tagged `(T-<n>)`. A duplicate merges into the existing item as `⚠ REPEATED: violated again in T-<n>, fixed by <fix>` - never a parallel entry. Wording may compress; nothing is ever deleted.
- **Summaries** - a one-line changelog only, capped at 1 General block + 2 recent individual `### Summary - T-<n>` blocks. Exactly one plain line per entry - never sub-headers, never a "What changed" / "Gotchas / pitfalls" / "Bugs hit & fixes" breakdown. Gotchas and bugs live ONLY in the master list - never restated, even compressed, inside a Summary block. The General block is one bullet per folded `T-<n>`, each a single line - never a per-task write-up. On every completion, state the check regardless of outcome. Over the cap: fold the oldest individual summary into General, e.g. `Summary bound check: 3 individual → folded T-9 into General → now General + T-10, T-11.` Within the cap: still state it, e.g. `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced.
- **Append-only after approval** - the only edits permitted on an APPROVED list are: flipping a task's own checkbox, marking a task or (only on explicit user instruction) a whole list `[~]`, appending/merging master-list entries, writing/folding one-line summaries, deleting a just-completed list's checklist after its summary is written, deleting an abandoned list's task lines. Nothing else is ever rewritten.
- **Lifecycle:** PENDING (draft; every revision edits in place, same `T-<n>`, never a new list) → APPROVED (frozen per the append-only rule above) → COMPLETED or ABANDONED - a list closes exactly these two ways, never a third. On completion (every item `[x]`): harvest new gotchas to the master list, append the one-line summary, delete the checklist entirely, enforce the summary cap, bump `package.json` version (patch) - same turn, before any new request. - all in the same turn, before any new request. ABANDONED only on explicit user instruction: mark the header `- [~] List abandoned by user request: <reason>`, delete its task lines, keep the header line. The agent never abandons or supersedes a list on its own initiative - not to tidy up, not to route around a mistake, not because a new request seems more relevant. A blank-placeholder ID with a quietly started new list is the same violation.
- **Abandoned task** (a single task, not the whole list): mark `- [~] <task> - superseded by T-<n>.<k>: <reason>` - never delete.
- **IDs** - highest `T-<n>` referenced anywhere in the file + 1 for a new list (start `T-1` if the file is new/empty); never reused. Flip `- [ ]`→`- [x]` the instant a task finishes, same turn, and state it: `Todo update: T-6.3 → [x].` A done task with no flip is not recorded.
- **Interrupted session** - an unchecked `- [ ]` item found on read: message is exactly `continue` → resume it. A new request instead → mandatory notice first: `Note: T-6 is still incomplete (4/7 done) - say "continue" to resume, or I'll proceed with this new request instead.` Never silently start a second list over an unmentioned incomplete one.
- **Self-heal on read** (first write of the session, before any plan write): multiple master lists or gotchas scattered outside it → consolidate into one; more than 2 individual summaries → fold to the cap; multiple pending (never-approved) lists for the same request → merge into one under the earliest `T-<n>`, discard the rest (no `[~]` record needed - they were never approved).

**`plan/spec.json`** - fast index of routes, DB schema, components, stores, server libs, auth, business logic, env vars. Read it instead of re-scanning the codebase; open named files only when a task needs exact current code. If missing, try run `svelte-app-map` skill to generate it first - or, if unavailable, an equivalent **lightweight** scan that writes the same schema. Fall back to a full deep read of the codebase if the map is missing. Patch only the affected entries when a task changes a tracked shape - route, DB schema, component, store, server lib, env var, auth rule, or business logic (validation, permission, pricing, or constraint rules count - the test is "tracked-shape change," never "styling vs. logic"). Does NOT apply - no observable difference in anything spec.json tracks: CSS/class swaps, copy edits, `console.log`, inline UI with no new file/behavior, pure internal refactors. Never regenerate the whole file for a small change. State the result inline for every task, with the actual reason, not a stock phrase.

## Post-Change Verification

Every edit, no exceptions, in order:

1. **Diff check first.** `git diff -- <file>` (or pre/post content diff if not a git repo) - read the actual diff, never rely on memory. Scan every `-` line for a removed comment (`//`, `/* */`, `<!-- -->`, `#`) - any found, restore before moving on. Cross-check `-`/`+` lines against this plan's Known constraints; fix any contradiction in the same tool-call cycle. State: `Diff check - <file>: no comments removed, no known-constraint violations.` A write with no stated result is unverified. Runs on every edit, including markup-only - those most often silently drop comments.
2. `mcp__svelte__svelte_autofixer` on every modified `.svelte` file - cheap, single-file, always.
3. `npm run check` only when type-relevant: script logic/props/events, `+page.server.ts`/`+server.ts`, a shared type, or a DB schema. Skip for markup/class/copy-only edits. Batch it across several small type-relevant tasks rather than running it after each one, unless a task touches a shared type/schema and needs an isolated check first.
4. `npm run build` only for new dependencies or `vite.config`/adapter changes - never routinely.
5. Confirm zero NEW errors (pre-existing ones are acceptable but must be called out).
6. Update `plan/spec.json` in the same turn a task's checkbox flips, per the rule above.

## Key Rules

- **Comments are permanent** - never delete one, including dormant commented-out boilerplate kept for future forks; checked mechanically via the diff step, never by memory. One that's factually wrong after a change can be updated but removal still needs explicit user confirmation, stated openly - never removed silently.
- **Files are permanent by default** - same logic: never delete/rename/move because something "looks" unused, duplicate, dead, or legacy. Deletion requires an explicit `DELETE:` entry in the approved plan plus the inline authorization statement (Hard Gate → Destructive ops). When in doubt, comment out or deprecate.
- Prefer Context7 MCP for DaisyUI/Tailwind/Drizzle docs over local `.txt` files.
- Svelte 5 Runes (`$state`, `$derived`) over `svelte/store` for reactivity.
- No global reactive state/stores in `/src/lib/server/` - server state must be stateless per-request, or one client's data can leak into another's response. Exception: large read-only reference data shared by everyone (countries, cities, names).
- `bind:value` (`bind:checked`/`bind:group` for checkboxes/radios), never one-way `value={...}`, for editable inputs seeded from server `load` data - `use:enhance` resets fields to `defaultValue` (baked at first render) on success; one-way `value` never updates that baseline, so fields silently revert to stale data even after `invalidateAll()`. Plain `value={...}` is fine for genuinely display-only content.
- Every `{#each}` over a dynamic/mutable array needs a unique key: `{#each array as item, i (item.uniqueId)}` - index keys cause DOM state bugs on reorder/delete. Omit the key only for fully static, hardcoded arrays.
- Any <form> containing <input type="file"> or a drag-and-drop upload component needs enctype="multipart/form-data" - without it the form still submits with no error, but the file is silently missing from request.formData() server-side.
- One `formSubmit` per page via `use:enhance={formSubmit}` (never `{formSubmit()}` or separate per-form handlers) - splitting handlers fragments the notification/reset logic and drifts inconsistent over time.
- Create actions named `new*`, matching frontend `formSubmit` conventions.
- Server actions: validate → try/catch the DB op → verify the mutation actually landed (`lastInsertRowid` or array length) → `syncTurso()` (Drizzle projects) → return `{ action, success: true, message }`; catch returns `fail(500, { action, success: false, message })`. Skipping the post-write verification step is how silent data-loss bugs happen.
- API routes reachable by cron, webhooks, or third-party callbacks must check a shared secret via header/query param, `error(401, 'Unauthorized')` on mismatch - an unauthenticated external endpoint is an open door.
- Reuse `/src/lib/clientUtils.ts` / `/src/lib/server/serverUtils.ts` before writing a new helper; multi-use utilities (e.g. `syncTurso()`) are a single shared export, never redefined inline.
- **Route Path Comment** at the top of every `/src/` file, stating its own relative path - the comment syntax depends on file type, never mix them up:
  - Server (`.ts`) files: `// src/routes/api/download-csv/+server.ts`
  - Frontend (`.svelte`) files: `<!-- // src/routes/(dashboard)/dashboard/[company_id]/+page.svelte -->`
  Also add a **Component Instructions** `<!-- // INSTRUCTIONS -->` block above `<script lang="ts">` on every file in `src/lib/components` (usage, auth requirements, non-obvious assumptions) - so a future agent and users can orient.
- DB queries and secured external fetches happen only in `+page.server.ts`/`+server.ts`, never `+page.svelte` - keeps credentials and query logic off the client bundle.
- No `try/catch` with an empty `catch`. No `[cite_start]` or citation text inside code blocks. Always `const` for function definitions and exports. Redact secrets as `[REDACTED]`, never inline.
- Svelte code blocks: the logic is written inside `<script lang="ts">`, but mark the markdown fence `typescript` or `javascript` - never `svelte` - when presenting the code.

## Frontend Conventions

**Imports order:** `$env/...` → `svelte`/`$app/...` → npm modules → `$lib/...` → `lucide-svelte` last.

**Props:**
```typescript
let { data } = $props();
const { getTable, company_id, tree } = $derived(data);
```

**Page structure:** `<svelte:head><title>` for the page name, plus a `<noscript>` fallback directly above the main markup:
```svelte
<noscript>
	<h1 style="font-weight:700; text-align: center;">Please enable Javascript to continue.</h1>
	<style type="text/css">#main-content { display: none; }</style>
</noscript>
```

**Modal state + click handler:**
```typescript
let currentModal = $state('');
let currentObj: any = $state({});
let openModal = $state(false);
let modalTitle = $state('');
let postAction = $state('?/');

const onClickModal = async (type: string, item: any) => {
	onResetFields();
	currentModal = type;
	currentObj = item;
	openModal = true;
	if (type === 'newAccount') {
		postAction = `?/newAccount`;
		modalTitle = `New Account ${accountType}`;
	}
	// Add additional modal types here...
};
```
One `onResetFields()` per page resets every form-related `$state` field to its initial value - called from `onClickModal` (before setting the new modal/`currentObj`) and from `formSubmit`'s `finally`:
```typescript
const onResetFields = () => {
	selectedClientId = '';
	clientName = '';
	clientPhone = '';
	clientEmail = '';
};
```
Named partial resets (`onResetSearchFields`, `onResetAddressFields`) only when a genuinely independent sub-form needs one, each resetting a complete scoped group - never a shortcut around maintaining the main `onResetFields`.

Modals always render last in the markup:
```svelte
{#if currentModal === 'newAccount'}
	<Modal isOpen={openModal} header={modalTitle} cssClass="max-w-2xl">
	</Modal>
{/if}
```
`Modal` is a shared imported component (e.g. `$lib/components/Modal.svelte`) - this exact usage shape (`isOpen`/`header`/`cssClass` props, `{#if}` wrapper) is what stays identical across every project, not just the surrounding state variables.

**`formSubmit`** - ONE per page handles ALL form submissions and notifications; never separate per-form handlers (`calendarSyncSubmit`, `profileSubmit` - forbidden). Every server action returns a unique `action` string in `result.data`, and `use:enhance={formSubmit}` on every `<form>` (never `{formSubmit()}`). Update reactive state inside the `if (action === '...')` blocks when a given action needs custom handling:
```typescript
const formSubmit = () => {
	loading = true;
	return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
		await update();
		try {
			if (result.type === 'success' && result.data) {
				const { action, message } = result.data;
				if (currentModal === 'form' || currentModal === 'info') {
					if (currentObj?.id) openAccounts[currentObj.id] = true;
				}
				// Handle specific actions with notifications
				if (action === 'filter' || action === 'modify') {
					notification.success(message);
				} else {
					resetActive = false;
					notification.success(message);
				}
			}
			if (result.type === 'failure' && result.data?.message) notification.error(result.data.message);
			if (result.type === 'error') notification.error(result.error.message);
			if (result.type === 'redirect') goto(resolve('/login'));
		} finally {
			onResetFields();
			treeTableList = tree;
			loading = false;
		}
	};
};
```

**Editable Input Bindings (`bind:value`):** any editable `<input>`/`<select>`/`<textarea>` sourced from server `load` data uses `bind:value` against a local `$state` seeded from that data - never one-way `value={...}`:
```typescript
let name = $state(user.name ?? '');
```
```svelte
<input id="name" name="name" bind:value={name} />
```
Why: `use:enhance` calls native `form.reset()` on success, resetting fields to `defaultValue` (baked at first render). One-way `value={...}` never updates `defaultValue`, so fields silently revert to stale data even after `invalidateAll()`. Plain `value={...}` is fine only for genuinely display-only content.

**`$derived` vs `$effect`** (canonical definition, referenced elsewhere): favor `$derived`. Usually exactly one `$effect` per page/component - multiple only when combining would cause dependency interference. Every `$effect()` sits at the bottom of `<script lang="ts">`, below `formSubmit` if one exists.

## Backend Conventions

**`+page.server.ts` structure:** environment imports (`$env/static/private`, etc.) explicitly at the top → `const`/`let`, helpers, DB instantiation → then `load`, then all actions grouped at the bottom:
```typescript
export const load: PageServerLoad = async ({ params, locals, url }) => { ... }
export const actions: Actions = { ... }
```

**Server Actions Pattern:** fetch/parse `request.formData()` → validate required fields, `fail(400)` if missing → wrap DB ops (`.insert`/`.update`/`.delete`) in `try/catch` → verify the mutation succeeded (`lastInsertRowid` or array length for LibSQL/Turso), `fail(500)` if not → await `syncTurso()` (LibSQL/Turso projects) → return `{ action: 'actionName', success: true, message: 'Success message' }`; catch returns `fail(500, { action: 'actionName', success: false, message: 'Failed to ...' })`.

**`+server.ts` / API routes** - applies to every `/src/routes/api` file and any `+server.ts` endpoint: same import order as above; variables/helpers after imports, before handlers; one `const` per verb (`export const GET: RequestHandler = ...`, `export const POST: RequestHandler = ...`) - if two verbs share identical logic, define one function and assign it to both exports; shared-secret auth for externally-triggered endpoints, never leave one open; DB ops in `try/catch`, `error(500, 'message')` on failure - never a bare `Response`; await `syncTurso()` after successful mutations; `json({...})` with a consistent, predictable shape (e.g. `{ success, found, sent, failed }`); Route Path Comment and Component Instructions apply here too.

## Project Structure

Three layout templates: `(dashboard)` (has a sidebar), `(page)` (no navigation), `(app)` (has a navbar). Components exclusive to `(dashboard)` → `/src/lib/dashboardComponents`; exclusive to `(app)`/client → `/src/lib/appComponents`; shared or other-template → `/src/lib/components`. All API routes live in `/src/routes/api`. `/data` holds local database files; `/uploads` holds dynamic user/app-generated files and is not compiled during `npm run build` (unlike `/static`).

SvelteKit routing is folder-based and deeply nested - search recursively into child folders, never stop at `/src/routes/` root. Layout groups in parentheses (`(dashboard)`) organize files without affecting URLs; dynamic params use `[brackets]`. Example: `http://localhost:5173/dashboard/12345` → `/src/routes/(dashboard)/dashboard/[company_id]/+page.svelte`. Always dig to the paired `+page.svelte` and `+page.server.ts`.

## Stack

DaisyUI 5.7 + Tailwind CSS 4.3 for UI. Turso/SQLite/LibSQL with Drizzle ORM, or MongoDB with Mongoose, for data. Favor Runes (`$state`, `$derived`) over `svelte/store`; when genuine cross-component client state is needed, writable stores go in `/src/lib/state.ts`, readable stores in `/src/lib/data.ts`.

## ⛔ FINAL REMINDER - same gate as the top of this file

This is a full restatement - attention to instructions decays over a long conversation and a shorthand reminder at the bottom is exactly what gets silently skipped many turns in. Read all three in full before your very next tool call:

1. Is it a write to a source file (`patch`, `write`, `edit`, `create_file`, `delete_file`, or any file-mutating tool)? If the user's latest message is NOT exactly `ok proceed` (trimmed, case-insensitive, standalone) - STOP. Print the Approval check line first and confirm the answer is genuinely YES before making this call. There is no implicit approval: a follow-up reply, a compliment, a new request, or a message that merely mentions "ok proceed" inside other text is not permission. The one write allowed before approval is `plan/todo.md` itself, during planning.
2. Is it a write to ANY file NOT listed in the approved plan's File/folder plan? - STOP. Scope never self-expands on its own initiative; propose a plan revision and wait for approval again.
3. Is it `delete_file` / rename / move? - STOP unless that exact path is flagged `DELETE:` / `RENAME:` in the approved plan AND you state `Destructive op - <path>: authorized by T-<n>.<k>` inline first. Never assume a file is unused, dead, or duplicate - it may be reached by dynamic imports, cron jobs, or external callers invisible to a static read.

Only exception to (1): a message that is exactly `continue` (standalone) while `plan/todo.md` still has an unchecked `- [ ]` item - for that incomplete list only.
