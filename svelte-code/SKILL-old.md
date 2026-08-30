---
name: svelte-code
description: Universal Svelte 5 / SvelteKit coding standards. Use when plannig, writing, reviewing, or modifying ANY Svelte code.
category: svelte
---

# Svelte 5 / SvelteKit Coding Standards

Refer to the rules outlined here verbatim when addressing architectural implementation patterns. Never over-engineer - write the minimal functional solution following strict YAGNI principles, terse and secure, no verbose explanation unless asked.

## Loading Rules

Always load this skill before writing Svelte code. Always check `plan/spec.json` and `plan/todo.md` before scanning the codebase or drafting a plan. Always run `mcp__svelte__svelte_autofixer` before sending Svelte code. Domain references bundled with this skill: `references/svelte-ai-prompts.md` (Svelte MCP prompts), `references/drizzle-orm-turso-libsql.md`, `references/mongodb-mongoose.md`.

## Post-Change Verification

Every edit, no exceptions, in order:

1. **Diff check first.** `git diff -- <file>` (or pre/post content diff if not a git repo) - read the actual diff, never rely on memory. Scan every `-` line for a removed comment (`//`, `/* */`, `<!-- -->`, `#`) - any found, restore before moving on. Cross-check `-`/`+` lines against this plan's Known constraints; fix any contradiction in the same tool-call cycle. State: `Diff check - <file>: no comments removed, no known-constraint violations.` A write with no stated result is unverified. Runs on every edit, including markup-only - those most often silently drop comments.
2. `mcp__svelte__svelte_autofixer` on every modified `.svelte` file - cheap, single-file, always.
3. `npm run check` only when type-relevant: script logic/props/events, `+page.server.ts`/`+server.ts`, a shared type, or a DB schema. Skip for markup/class/copy-only edits. Batch it across several small type-relevant tasks rather than running it after each one, unless a task touches a shared type/schema and needs an isolated check first.
4. `npm run build` only for new dependencies or `vite.config`/adapter changes - never routinely.
5. Confirm zero NEW errors (pre-existing ones are acceptable but must be called out).
6. Update `plan/spec.json` in the same turn a task's checkbox flips, per the rule above.

**Runtime-only failures pass typecheck.** `svelte-check`/`npm run check` catch neither const-`$state` rebinds nor SSR-only TDZ (`$derived`/closures reading a var declared later in the file) nor a feature whose only UI entry point never actually runs - after any non-trivial change, boot the dev server and click through the affected page/flow before calling it verified.

## Key Rules

- **Comments are permanent** - never delete one, including dormant commented-out boilerplate kept for future forks; checked mechanically via the diff step, never by memory. One that's factually wrong after a change can be updated but removal still needs explicit user confirmation, stated openly - never removed silently.
- **Files are permanent by default** - same logic: never delete/rename/move because something "looks" unused, duplicate, dead, or legacy. Deletion requires an explicit `DELETE:` entry in the approved plan plus the inline authorization statement (Hard Gate → Destructive ops). When in doubt, comment out or deprecate.
- Prefer Context7 MCP for DaisyUI/Tailwind/Drizzle docs over local `.txt` files.
- Svelte 5 Runes (`$state`, `$derived`) over `svelte/store` for reactivity.
- `const x = $state(...)` can be mutated but never rebound - reassignment (`x = new Set(...)`, `x = {}`) needs `let x = $state(...)` or Svelte throws `Cannot assign to constant`.
- No global reactive state/stores in `/src/lib/server/` - server state must be stateless per-request, or one client's data can leak into another's response. Exception: large read-only reference data shared by everyone (countries, cities, names).
- `bind:value` (`bind:checked`/`bind:group` for checkboxes/radios), never one-way `value={...}`, for editable inputs seeded from server `load` data - `use:enhance` resets fields to `defaultValue` (baked at first render) on success; one-way `value` never updates that baseline, so fields silently revert to stale data even after `invalidateAll()`. Plain `value={...}` is fine for genuinely display-only content.
- Every `{#each}` over a dynamic/mutable array needs a unique key: `{#each array as item, i (item.uniqueId)}` - index keys cause DOM state bugs on reorder/delete. Omit the key only for fully static, hardcoded arrays.
- When filtering an array for display but mutating/removing by array index (e.g. `removeLine(index)`), pass the row's stable id instead of the filtered index - indexes drift between the filtered view and the full array, so it deletes the wrong row.
- Any <form> containing <input type="file"> or a drag-and-drop upload component needs enctype="multipart/form-data" - without it the form still submits with no error, but the file is silently missing from request.formData() server-side.
- Parse-error traps: `class:foo/bar={cond}` (directive name containing `/`) fails - use a ternary on `class={...}` instead; `{/* */}` inside an element's attribute list fails - comments go outside the tag; a missing comma between blocks in `export const actions = {...}` breaks the generated proxy - re-check after adding any action.
- Absolutely-positioned dropdown/suggestion lists get clipped inside an `overflow-x-auto` ancestor (e.g. a grid) - use a native `<datalist>` there instead of a custom-positioned picker. A focus-driven DaisyUI dropdown (`:focus-within`) needs the trigger blurred on close, or it won't close on a second click.
- One `formSubmit` per page via `use:enhance={formSubmit}` (never `{formSubmit()}` or separate per-form handlers) - splitting handlers fragments the notification/reset logic and drifts inconsistent over time.
- Create actions named `new*`, matching frontend `formSubmit` conventions.
- Server actions: validate → try/catch the DB op → verify the mutation actually landed (`lastInsertRowid` or array length) → `syncTurso()` (Drizzle projects) → return `{ action, success: true, message }`; catch returns `fail(500, { action, success: false, message })`. Skipping the post-write verification step is how silent data-loss bugs happen.
- Validation is always server-side even when the UI already enforces it (client checks are UX only), and any switch/branch on an enum/variant column must handle every value the DB constraint allows, not just the ones the current UI offers.
- A delete action whose row has children in other tables needs an explicit cascade in the same action (or `ON DELETE CASCADE`) - otherwise the children are orphaned and accumulate silently.
- `use:enhance`'s callback receives `result: ActionResult` already deserialized; a raw `fetch()` against an action endpoint gets back `devalue`-encoded text instead, parse it with `deserialize()`/`devalue.parse()`. Either way, `fail()` always returns HTTP 200 with the status embedded in `result.data` - never branch on the raw HTTP status.
- API routes reachable by cron, webhooks, or third-party callbacks must check a shared secret via header/query param, `error(401, 'Unauthorized')` on mismatch - an unauthenticated external endpoint is an open door.
- `+layout.server.ts` LOAD guards protect pages only - they never run before a POST action, and never run for `+server.ts` children. Every action/endpoint re-validates auth/ownership itself; never assume the layout already covered it.
- Any filesystem path assembled from request input (upload/download endpoints) needs component-level sanitization (reject `.`/`..` segments) plus a resolved-path containment check, on every HTTP verb that touches it.
- Any new session/auth-state-writing action seeds every column a sibling path seeds (e.g. every expiry/tracking field together) - a partially-seeded row makes an unrelated downstream check silently fail.
- Cloning an existing CRUD route copies its stale success/error messages AND its (missing) ownership guards along with the logic - sweep both on every clone, not just the parts you meant to change.
- Reuse `/src/lib/clientUtils.ts` / `/src/lib/server/serverUtils.ts` before writing a new helper; multi-use utilities (e.g. `syncTurso()`) are a single shared export, never redefined inline.
- **Route Path Comment** at the top of every `/src/` file, stating its own relative path - the comment syntax depends on file type, never mix them up:
  - Server (`.ts`) files: `// src/routes/api/download-csv/+server.ts`
  - Frontend (`.svelte`) files: `<!-- // src/routes/(dashboard)/dashboard/[company_id]/+page.svelte -->`
  Also add a **Component Instructions** `<!-- // INSTRUCTIONS -->` block above `<script lang="ts">` on every file in `src/lib/components` (usage, auth requirements, non-obvious assumptions) - so a future agent and users can orient.
- DB queries and secured external fetches happen only in `+page.server.ts`/`+server.ts`, never `+page.svelte` - keeps credentials and query logic off the client bundle.
- Any report/listing query filters out soft-deleted/voided rows the same way the write path does, from the first version of the query - if the filter is added later, sweep it into every existing query over that table too.
- No `try/catch` with an empty `catch`. No `[cite_start]` or citation text inside code blocks. Always `const` for function definitions and exports. Redact secrets as `[REDACTED]`, never inline.
- `new Date('')` (empty/invalid string) silently becomes `NaN` downstream - guard optional date fields with a fallback before constructing `Date`. Pushing to an array before its own later `const` declaration in the same scope is a TDZ `ReferenceError` at runtime that type-checkers miss - hoist declarations above first use. `array.flatMap(async fn)` returns unresolved Promises, not flattened results - use `(await Promise.all(array.map(fn))).flat()`.
- `as const` on a numeric array makes a readonly tuple that breaks `.includes()` against a wider number type - use `readonly number[]` instead. `!res.ok` doesn't narrow a discriminated union (`{ok:true}|{ok:false,message}`) under non-strict TS - compare explicitly (`res.ok === false`).
- `toISOString().slice(...)` for date/month defaults is UTC and drifts near local midnight - always go through a canonical local-timezone helper, never raw UTC slicing.
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

**`$derived` vs `$effect`** (canonical definition, referenced elsewhere): favor `$derived`. Usually exactly one `$effect` per page/component - multiple only when combining would cause dependency interference. Every `$effect()` sits at the bottom of `<script lang="ts">`, below `formSubmit` if one exists. Never mutate a stored/source value just to reformat it for display (e.g. a price-mode toggle) - recompute the display inside `$derived` and leave the source alone, or repeated round-trips drift.

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

SvelteKit routing is folder-based and deeply nested - search recursively into child folders, never stop at `/src/routes/` root. Layout groups in parentheses (`(dashboard)`) organize files without affecting URLs; dynamic params use `[brackets]`. Example: `http://localhost:5173/dashboard/12345` → `/src/routes/(dashboard)/dashboard/[company_id]/+page.svelte`. Always dig to the paired `+page.svelte` and `+page.server.ts`. `resolve()`/`goto()` don't validate that the target route id exists - a typo'd path resolves fine and 404s only at runtime. Components persist across navigation between different values of the same dynamic param (`[company_id]`) with no automatic remount - module-level stores/`$state` can leak the previous param's data into the new page; use `{#key company_id}` or re-derive the relevant state inside an `$effect` keyed on the param.

## Stack

DaisyUI 5.7 + Tailwind CSS 4.3 for UI. Turso/SQLite/LibSQL with Drizzle ORM, or MongoDB with Mongoose, for data. Favor Runes (`$state`, `$derived`) over `svelte/store`; when genuine cross-component client state is needed, writable stores go in `/src/lib/state.ts`, readable stores in `/src/lib/data.ts`.
