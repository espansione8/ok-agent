---
name: svelte-coding-standards
description: Universal Svelte 5 / SvelteKit coding standards. Use when writing, reviewing, or modifying ANY Svelte code. Covers conventions, Drizzle ORM + Turso/LibSQL (default), MongoDB + Mongoose (optional).
category: svelte
---

# Svelte 5 / SvelteKit Coding Standards

> **🚫 HARD GATE — READ FIRST. Violating this gate voids the skill.**
>
> Before writing or modifying ANY Svelte code, you MUST:
> 1. Read this ENTIRE file top to bottom. Every plan item must already reflect these conventions.
> 2. Produce a structured **ARCHITECTURE PLAN** (§1) whose atomic tasks each cite the specific convention(s) they must follow.
> 3. Write that task list to `.plan/todo.md` (§4 format, every item `- [ ]`) DURING planning — before approval. This is the ONLY file-write permitted before "ok proceed". ONE REQUEST = ONE LIST, always: even a large multi-phase plan is a single list (phases become task ranges T-<n>.1…T-<n>.k, never separate T-<n> lists). If a pending (not yet approved) list for the current request already exists, UPDATE IT IN PLACE — same `T-<n>` ID, same header line; add/remove/reword its `- [ ]` items as feedback dictates. NEVER append a second list or take a new `T-<n>` for a plan revision.
> 4. Present the plan as your ENTIRE response. Nothing else.
> 5. **STOP. End your turn.** Approval is a mechanical check on the user's next message: it grants permission ONLY if that message, after trimming surrounding whitespace, is exactly `ok proceed` (case-insensitive, standalone — nothing before or after it). A message that merely contains, quotes, or mentions the phrase does NOT approve — see **Approval rules** below.
> 6. Do NOT call any source-file write tool (`patch`, `write`, `edit`, `create_file`, `delete_file`, or equivalent) before approval. Read-only tools (`search_files`, `view`/`read`) and the single `.plan/todo.md` write are allowed during planning; nothing else.
> 7. If your next action before approval would be a source-file write — stop. That is the gate firing. Do not make the call. If you catch yourself writing reasoning like "this counts as approval" — that sentence IS the gate firing. Stop.
> 8. Once a message that is exactly `ok proceed` (trimmed, case-insensitive) arrives: implement tasks in order from the already-written `.plan/todo.md`, flipping each checkbox to `- [x]` as completed (§4). Do not re-write or re-plan the list. Implementation stays inside the **Execution scope lock** below.
>
> First line of your response MUST be exactly: `PLAN MODE — plan only, no file-write tools until "ok proceed".` — repeat it as the first line of EVERY response until approval arrives.
>
> **Approval rules — mechanical, no interpretation:**
> - The check is an exact match, not a substring search: the user's latest message, trimmed of surrounding whitespace, must equal `ok proceed`, case-insensitive, with no other content. Messages that contain the phrase inside other text — "don't say ok proceed yet", "why do you keep asking for ok proceed?", "not ok proceed", "ok proceed, and also…" — do NOT approve. Exact match → approved. No exact match → NOT approved. There is no other approval signal.
> - ❌ **Implicit approval does not exist.** The following reasoning is banned — do not think it, do not write it: "ok proceed is implicitly given", "the user addressing/responding to the plan counts as approval", "I'll take this as approval", "effectively/essentially approved", "since the user replied I may proceed".
> - These are NOT approval: "yes", "go ahead", "do it", "sounds good", "lgtm", "perfect", questions, revisions, added requirements, compliments, new requests — in any language or phrasing.
> - Any follow-up that is not approval is **plan feedback**: incorporate it by UPDATING THE SAME pending task list IN PLACE in `.plan/todo.md` — same `T-<n>` ID, same header; modify its `- [ ]` items to match the revised plan (still the one permitted write). A revision NEVER creates a new list, NEVER bumps the `T-<n>` ID, and NEVER leaves the old draft alongside the new one. Then re-present the revised plan and wait again for the exact standalone `ok proceed` message. The gate fully resets on every revision. If a message embeds `ok proceed` inside other text, it is still feedback — tell the user to send `ok proceed` alone if they intend to approve.
>
> **Execution scope lock — after approval:**
> - After "ok proceed" you may create, modify, or delete ONLY files listed in the approved plan's File/folder plan (§1.1). Every unlisted file is frozen — read-only.
> - If implementation reveals a change is needed in an unlisted file — STOP. Propose it as a plan-revision addition and wait for approval again. Expanding scope on your own is a gate violation.
>
> **Destructive operations — zero assumption:**
> - `delete_file` / rename / move of any source file is BANNED unless that exact path appears in the approved plan explicitly flagged `DELETE:` or `RENAME:` (§1.1). Nothing else authorizes it.
> - Before executing any deletion/rename, state it inline: `Destructive op — <path>: authorized by T-<n>.<k> of the approved plan.` An unstated destructive op is unauthorized.
> - ❌ Banned reasoning: "this file looks unused/duplicate/dead/legacy, so I'll remove it." Dormant files may be referenced by dynamic imports, config, cron jobs, or external services. When in doubt: comment out or deprecate — never delete.
>
> **Exception — resuming:** if the user's message is exactly `continue` (case-insensitive, standalone) AND the latest list in `.plan/todo.md` has an unchecked `- [ ]` item, skip this gate. That list was already approved. Run §0, then resume from the next unchecked item — no new plan, no "ok proceed" needed. `continue` is ONLY this resume path — it never approves a new plan.

## Overview
Refer to the rules outlined here verbatim when addressing architectural implementation patterns.

## Loading Rules
- **ALWAYS** load this skill before writing Svelte code.
- **ALWAYS** check `.plan/spec.json` and `.plan/todo.md` before scanning the codebase or drafting a plan (§0).
- **ALWAYS** run Svelte MCP (`mcp__svelte__svelte_autofixer`) before sending Svelte code.
- DaisyUI docs: load the `daisyui5` skill (handles automatically).
- Svelte MCP AI prompt: `references/svelte-ai-prompts.md` from this skill.
- Drizzle + Turso/LibSQL: `references/drizzle-orm-turso-libsql.md`.
- MongoDB + Mongoose: `references/mongodb-mongoose.md`.

## Mandatory Pre-Task Workflow (AUTO-EXECUTE every prompt)

### 0. Context & Resume Check
Check `.plan/` first — cheaper than re-scanning the codebase.

**`.plan/spec.json` (fast index):**
- If it exists, read it. It is the primary source for routes, components, stores, server libs, DB schema, auth, business logic, env vars. Do NOT re-scan the codebase to rediscover what it already gives. Open named files only when a task needs exact current code.
- If missing, run the `app-map` skill to generate it first (or an equivalent lightweight scan writing the same schema).

**`.plan/todo.md` (project memory):**
- Read the whole file before drafting any plan. Its content is: any in-progress list plus the rolling summaries (`### Summary — General` + the 2 most recent individual summaries) — the summaries hold every gotcha/pitfall/bug ever logged. Completed checklists are deleted once summarized; the summaries ARE the history.
- Carry every applicable gotcha/pitfall/bug from the summaries into the new plan as a written Known constraints checklist (§1.0). A gotcha not written there never gets checked later.
- If an in-progress list still has an unchecked `- [ ]`: prior session was interrupted.
  - Message is exactly "continue" → Hard Gate exception: resume from next unchecked item.
  - New request while an incomplete list remains → MANDATORY notice before anything else, e.g. `Note: T-6 is still incomplete (4/7 done) — say "continue" to resume, or I'll proceed with this new request instead.` Never append a new list silently over an unmentioned incomplete one.
  - An incomplete list is NEVER marked abandoned/superseded/closed by the agent on its own initiative. See §4 for the only two ways a list closes.
- Count `### Summary — T-<n>` blocks (excluding `### Summary — General`). If more than 2, fold down to 2 (§4 self-heal) as the FIRST write of the session, before any plan.
- Self-heal on duplicate pending lists: if multiple PENDING (all-`- [ ]`, never approved) lists exist for the same request — legacy of the old per-revision-append bug — merge them into ONE pending list under the FIRST `T-<n>` of the set as the first write of the session: keep the latest revision's items, delete the superseded duplicate lists entirely (headers included — never approved, so no `- [~]` record, no Summary).
- If the file doesn't exist, it is created during planning (Hard Gate step 3).

### 1. Planning & Task List
Produce a structured ARCHITECTURE PLAN. No code, no file-write tools while producing it. Exclude `.gitignore` paths from codebase reading. Read this skill in full first so the plan is standards-compliant from the start. The plan MUST cover:

0. **Known constraints** — every applicable gotcha/pitfall/bug from `.plan/todo.md` summaries, written as its own checklist. If none apply or no file exists, state that plainly — never omit the section. §3's diff check holds every edit against this list.
1. **File/folder plan** — every file created/touched: path, one-line purpose, specific conventions applying to it. Files to be DELETED or RENAMED must be flagged `DELETE: <path>` / `RENAME: <old> → <new>` — approval covers destructive ops ONLY through these flags (Hard Gate → Destructive operations). Flag any new server actions or API routes.
2. **Cross-page impact** — run the §2 search; include a "Pages checked" list naming each inspected file and safe/affected status.
3. **Data flow** (if writing/validating data) — trace origin → validation → write points; note every place the same rule/shape is enforced twice; for shared schemas name exact field/type pairs and the single file both client and server import.
4. **Verification gates** — per file: `mcp__svelte__svelte_autofixer` (yes for `.svelte`) and `npm run check` (yes only if type-relevant — script logic/props/events, `+page.server.ts`/`+server.ts`, shared type, schema; no for markup/class/copy-only edits, §3). Do NOT plan `npm run build` unless adding a dependency or touching `vite.config`/adapter config.
5. **New dependencies / DaisyUI classes** — list them; flag which need a Context7 lookup.
6. **Convention compliance checklist** — per-file rows for whichever apply: Route Path Comment, Component Instructions header, `formSubmit`/`new*` naming, single `$effect` at script bottom, Server Actions Pattern (validate → try/catch → `syncTurso()`), API auth for external endpoints, `{#each}` keying, `bind:value` vs plain `value`. Only rows relevant to touched files.
7. **Responsive & Cross-Device Check** — for any frontend (`.svelte`) changes.
8. **Risks** — anything that could desync frontend/backend or need different handling across web/iOS/Android.
9. **Assumptions & Questions for Confirmation** — educated assumptions may shape the PLAN DRAFT, but ALWAYS end with a dedicated bulleted list of clarifying questions. Tasks depending on an unconfirmed assumption are flagged `[needs confirmation]` in the todo list — implementation STOPS at such a task and asks; it never proceeds on an assumption.

Break everything into atomic todo items citing their conventions. Write that exact list to `.plan/todo.md` now (§4 format, all `- [ ]`) — planning output, the one allowed write. If a pending list for this request already exists there, rewrite ITS items in place under the same `T-<n>` header instead of appending a new list — one request owns exactly one list from first draft through approval. Then present the plan, STOP, wait for the exact standalone message `ok proceed`.
- DO NOT write component/server/schema code in the plan response.
- DO ask for `.env` values when needed.
- DO end the reply with exactly: `Review this plan — do not implement yet.`

### 2. Cross-Page Impact Analysis (MANDATORY)
Before modifying any `+page.svelte`, `+page.server.ts`, or `+server.ts`:
- `search_files` for key field names (e.g. `user`, `product`) across all of `src/routes/` (recursive) to find every consumer. Read-only — allowed during planning.
- Specifically check: does another page read the same `data` fields being changed/removed/renamed? Query the same tables? Does a UI change affect form data submitted to a shared server action?
- Document results in the plan's "Pages checked" section.

### 3. Post-Change Verification
- **Diff check — run FIRST on EVERY edit, no exceptions:**
  - Immediately after writing/patching a file, run `git diff -- <file>` (or diff held pre-edit vs post-edit content if not a git repo). Read the actual diff — never rely on memory.
  - Scan every `-` line for removed comments (`//`, `/* */`, `<!-- -->`, `#`). Any found → Comment Preservation violation: restore before moving on.
  - Cross-check `-`/`+` lines against every item in this plan's Known constraints. Any contradiction → fix in the same tool-call cycle.
  - State the result inline per file: `Diff check — <file>: no comments removed, no known-constraint violations.` A file write with no stated result is unverified.
  - Runs on EVERY edit, including markup-only — those most often silently drop comments.
- Run `mcp__svelte__svelte_autofixer` on every modified `.svelte` file before sending code — cheap, single-file, always.
- Run `npm run check` only when the change is type-relevant: `<script>` logic/props/events, `+page.server.ts`/`+server.ts`, shared type, DB schema. Skip for markup/class/static-copy-only edits.
- Batch `npm run check` across several small type-relevant tasks — run once after the batch, unless one task touches a shared type/schema and needs an isolated check first.
- Do NOT run `npm run build` routinely. Reserve for new dependencies, `vite.config`/adapter changes, or pre-deploy.
- Confirm zero NEW errors (pre-existing errors acceptable but must be called out).

### 4. Persist Progress — `.plan/todo.md`
The list is written during planning (Hard Gate step 3); by "ok proceed" it already exists with all items `- [ ]`. This section is maintaining it.

Lifecycle states of a list:
- PENDING (draft, pre-approval): created on the first plan draft of a request; every plan-feedback revision edits this SAME list IN PLACE — same `T-<n>` ID, same header; items may be added, removed, or reworded, all staying `- [ ]`. Revisions never create a new list, never take a new ID, never leave two drafts coexisting.
- APPROVED (after the exact standalone `ok proceed`): frozen except for checkbox flips and `- [~]` marks per the rules below.
- COMPLETED / ABANDONED: handled by the completion and abandonment flows below.

Append-only AFTER approval. Only in-place edits allowed: updating the PENDING draft (pre-approval only, as above), flipping a task's own checkbox, marking a task (or, only on explicit user instruction, a whole list) `- [~]`, deleting a just-completed list's checklist after its Summary is written, deleting an abandoned list's task lines (its `- [~]` header line stays), folding an aging summary into General. Nothing else is ever rewritten.
- **IDs:** highest `T-<n>` referenced anywhere in the file + 1 for a new list (start `T-1` if new/empty) — check the General header range, individual summaries, and `⚠ REPEATED` lines. IDs are never reused. Each task gets `T-<n>.<k>`. A new ID is allocated ONLY for a genuinely new request/list. Plan-feedback revisions of a PENDING list keep its existing `T-<n>` for the entire planning loop — they edit items in place; they never re-number, never append a parallel list, never reserve an ID.
- **New list format:**

```markdown
## Todo List T-<n> — <short title> — <YYYY-MM-DD>
Request: <one-line restatement>
- [ ] T-<n>.1 — <atomic task> (convention: <cited convention(s)>)
- [ ] T-<n>.2 — <atomic task> (convention: <cited convention(s)>)
```

- **Checkbox flips are immediate:** the instant a task finishes, flip `- [ ]` → `- [x]` in the same turn, before the next task, and state it inline: `Todo update: T-6.3 → [x].` A done-task with no flip is not recorded.
- **Abandoned task:** mark `- [~] <task> — superseded by T-<n>.<k>: <reason>` — never delete.
- **A whole list closes exactly two ways:** all items reach `[x]` (completion flow below), or the user explicitly says to drop it → mark its header `- [~] List abandoned by user request: <reason>` and delete its task lines (the `- [~]` header line is the only record kept — no summary is written for abandoned lists). The agent NEVER abandons/supersedes/reserves a list on its own — not to tidy up, not to route around a mistake, not because a new request seems more relevant. A blank-placeholder ID with a quietly started new list is the same violation. See §0 for the mandatory notice.
- **On full completion** (every item `[x]`), in the same turn, before any new request:
  1. Append the summary (never summarize a partially completed list):

```markdown
### Summary — T-<n>
- What changed: <files touched, structural changes>
- Gotchas / pitfalls: <non-obvious things that cost time or could trip up a future agent>
- Bugs hit & fixes: <bug → root cause → fix>
```

     - Any Known-constraints item violated during implementation — even if self-caught — gets its own line: `⚠ REPEATED: <constraint> — violated again in T-<n>, fixed by <fix>`. Never fold into prose; never drop or soften during folding (only merge with other `⚠ REPEATED` lines for the *same* constraint).
  2. **Delete the done checklist entirely** — header and every `- [x]` line. The Summary is now the only record of that list, and it carries everything that matters (what changed, gotchas, bugs). Keeping checked-off task lists or collapsed one-line records is pure token waste. Never delete the current in-progress list.
  3. **Enforce the summary bound — every completion, no skipping:** count `### Summary — T-<n>` blocks (excluding General; the one just written counts). If more than 2, fold the oldest into `### Summary — General (T-1..T-<k>)` — dedupe, but keep every distinct gotcha/pitfall/bug — until exactly 2 individual summaries remain. State inline: `Summary bound check: 3 individual (T-9, T-10, T-11) → folded T-9 into General → now General + T-10, T-11.` If within bound, still state it: `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced.
- **The bound:** at most 3 detailed summary blocks ever — one `### Summary — General (T-1..T-<k>)` plus the 2 most recent individual summaries. The summaries ARE the project memory — gotchas, pitfalls, and bugs are what matter. Folding shortens the file; it NEVER discards a warning.
- **Self-heal on read:** if the §0 read shows more than 2 individual summaries, folding down to 2 is the FIRST write of the session — before any plan write.

### 5. Keep `.plan/spec.json` in Sync
Check after **every completed task**, in the same turn its checkbox flips — never deferred to the end.

- **The test:** did this task change a shape `spec.json` tracks — route, DB schema (tables/columns), component file, store, server lib, integration, env var, auth rule, or business logic (validation rule, permission/auth check, pricing/eligibility rule, business constraint)? Logic is NOT exempt — the test is tracked-shape change, never "styling vs logic".
- **Applies:** any new/removed/changed tracked shape — anything a future agent would need `spec.json` to know instead of re-reading the code.
- **Does not apply:** changes with no observable difference in app behavior or structure that spec.json tracks (CSS/class swaps, copy edits, `console.log`, inline UI with no new file/behavior, pure internal refactors).
- When it applies: patch only the affected entries — never regenerate the file or re-run a full `app-map` scan.
- **State the result inline for every task, whichever branch applies** — with the *actual* reason for that specific task, not a stock phrase. A task with no stated spec.json line is unverified.

## Key Rules
- **Comment Preservation (non-negotiable):** NEVER delete an existing comment — they are references, including dormant/commented-out boilerplate kept for future forks. Checked mechanically via §3's diff check, never by memory. If one truly must go (factually wrong after a change), say so explicitly and get user confirmation first — never remove silently.
- **No destructive assumptions (non-negotiable):** NEVER delete/rename/move a file because it "looks" unused/duplicate/dead/legacy — deletion requires an explicit `DELETE:` entry in the approved plan (§1.1) plus the inline statement before executing (Hard Gate → Destructive operations). When in doubt, comment out or deprecate. Files get the same preservation discipline as comments.
- Prefer Context7 MCP for DaisyUI, Tailwind, Drizzle docs over local `.txt` files.
- Always run `mcp__svelte__svelte_autofixer` before sending Svelte code.
- Use Svelte 5 Runes (`$state`, `$derived`) for reactivity.
- NEVER create global reactive state/stores in `/src/lib/server/` — server state must be stateless per-request to prevent cross-client leaks. Exception: huge read-only data reused across all users (nations, cities, names).
- Always `bind:value` for editable inputs sourced from server `load` data.
- Every `{#each}` over dynamic arrays needs a unique key `(item.uniqueId)`.
- Single `formSubmit` handler with `use:enhance={formSubmit}` — no per-form handlers.
- Actions creating new records are named `new*` (e.g. `newAccount`).
- Server actions: validate → try/catch DB → return fail/success → await `syncTurso()` (Drizzle projects).
- API routes: protect externally-triggered endpoints with shared secrets.
- Helpers live in `/src/lib/clientUtils.ts` and `/src/lib/server/serverUtils.ts` — check and reuse before writing new. Multi-use utilities go there (e.g. `syncTurso()` is a single shared export — never redefined inline).
- **Route Path Comment:** every file under `/src/` starts with a comment stating its relative path.
  - Server: `// src/routes/api/download-csv/+server.ts`
  - Frontend: `<!-- // src/routes/(dashboard)/dashboard/[company_id]/+page.svelte -->`
- **Component Instructions:** at the top of every component file (before script/markup), a comment block with usage instructions and important notes. Same for `+page.server.ts`/`+server.ts`: what triggers it, auth requirements, non-obvious assumptions (expected schema fields, external payload shapes).
- **Code safety:** all direct DB queries and GET/POST fetches to secure external APIs happen in `+page.server.ts` or `+server.ts` — never in `+page.svelte`.
- No `try/catch` with empty `catch`.
- NO `[cite_start]` or any citation text inside code blocks.
- Svelte code blocks: wrap logic in `<script lang="ts">` but mark the markdown fence `typescript` or `javascript`.
- Always `const` for function definitions and exports.
- NEVER include API keys/tokens/passwords/credentials — write `[REDACTED]`.

## Frontend Conventions

### Imports order
1. `$env/...`
2. `svelte`, `$app/...`
3. NPM modules
4. `$lib/...` user modules/components
5. `lucide-svelte` (last)

### Props pattern

```typescript
let { data } = $props();
const { getTable, company_id, tree } = $derived(data);
```

### Page structure
- `<svelte:head>` with `<title>` for page name.
- `<noscript>` block directly above main HTML:

```svelte
<noscript>
	<h1 style="font-weight:700; text-align: center;">Please enable Javascript to continue.</h1>
	<style type="text/css">
		#main-content {
			display: none;
		}
	</style>
</noscript>
```

### Modal and UI State Management

Modal state:

```typescript
// Modal state
let currentModal = $state('');
let currentObj: any = $state({});
let openModal = $state(false);
let modalTitle = $state('');
let postAction = $state('?/');
```

`onClickModal` standard structure:

```typescript
const onClickModal = async (type: string, item: any) => {
	onResetFields();
	currentModal = type;
	currentObj = item;
	openModal = true;
	if (type === 'newAccount') {
		postAction = `?/newAccount`; // Handles actions dynamically
		modalTitle = `New Account ${accountType.toUpperCase()}`;
	}
	// Add additional modal types here...
};
```

`onResetFields`:
- Every page defines ONE `const onResetFields = () => { ... }` resetting every form-related `$state` field to initial values. Called from `onClickModal` (before setting new modal/`currentObj`) and from `formSubmit`'s `finally`.

```typescript
const onResetFields = () => {
	selectedClientId = '';
	clientName = '';
	clientPhone = '';
	clientEmail = '';
};
```

- **Exception — named partial resets:** only when logic genuinely requires clearing a subset (independent sub-form, search/filter block): define a separately named function (`onResetSearchFields`, `onResetAddressFields`). Each must reset a complete, clearly scoped group — never a single field, never scattered inline resets. Not a shortcut to avoid maintaining `onResetFields`, which still owns all remaining fields.

Modals ALWAYS at the bottom of the HTML, starting with `{#if}`:

```svelte
{#if currentModal === 'newAccount'}
	<Modal isOpen={openModal} header={modalTitle} cssClass="max-w-2xl">
	</Modal>
{/if}
```

### SvelteKit Form Submissions (use:enhance)
- ONE `formSubmit` per page handles ALL form submissions and notifications. Never separate handlers (`calendarSyncSubmit`, `profileSubmit` — forbidden).
- Every server action returns a unique `action` string in `result.data`; create actions start with `new`.
- Every `<form>` uses `use:enhance={formSubmit}` — never `{formSubmit()}`.
- Update reactive state inside the `if (action === '...')` blocks when needed.

```typescript
const formSubmit = () => {
	loading = true;
	return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
		await update();
		try {
			if (result.type === 'success' && result.data) {
				const { action, message, payload } = result.data;
				// Handle specific actions
				if (currentModal === 'form' || currentModal === 'info') {
					if (currentObj?.id) {
						openAccounts[currentObj.id] = true;
					}
				}
				// Handle specific actions with notifications
				if (action === 'filter' || action === 'modify') {
					notification.success(message);
				} else {
					resetActive = false;
					notification.success(message);
				}
			}
			if (result.type === 'failure' && result.data?.message) {
				notification.error(result.data.message);
			}
			if (result.type === 'error') {
				notification.error(result.error.message);
			}
			if (result.type === 'redirect') {
				goto(resolve('/login'));
			}
		} finally {
			onResetFields();
			treeTableList = tree;
			loading = false;
		}
	};
};
```

### {#each} Keying
- Every `{#each}` over dynamic/mutable arrays MUST have a unique key: `{#each array as item, i (item.uniqueId)}`
- NEVER key by loop index — causes DOM state bugs on reorder/delete.
- Omit key only for fully static, hardcoded arrays.

### Editable Input Bindings (bind:value)
- Any editable `<input>`/`<select>`/`<textarea>` sourced from server `load` data MUST use `bind:value` (`bind:checked`/`bind:group` for checkboxes/radios) against a local `$state` seeded from the data — never one-way `value={...}`.

```typescript
let name = $state(user.name ?? '');
```

```svelte
<input id="name" name="name" bind:value={name} />
```

- **Why:** `use:enhance` calls native `form.reset()` on success, resetting fields to `defaultValue` (baked at first render). One-way `value={...}` never updates `defaultValue`, so fields silently revert to stale data even after `invalidateAll()`. `bind:value` makes field state the source of truth.
- Plain `value={...}` only for genuinely display-only content.

### $derived vs $effect
*(Canonical definition of this rule — stated only here; other sections reference it.)*
- Favor `$derived` over `$effect`.
- `$effect` only when necessary (e.g. data reloading). Usually exactly ONE per page/component. Multiple allowed only if combining would cause interference (one effect's dependency retriggering unrelated logic).
- Every `$effect()` sits at the BOTTOM of `<script lang="ts">`, below `formSubmit` if one exists.

## Backend Conventions (+page.server.ts)

### Structure
1. Environment imports (`$env/static/private` etc.) explicitly at the top.
2. All `const`/`let`, helpers, and DB instantiations after imports, before `load`.
3. `export const load: PageServerLoad = async ({ params, locals, url }) => { ... }`
4. All actions grouped at the bottom: `export const actions: Actions = { ... }`

### Server Actions Pattern
1. Fetch/parse `request.formData()`.
2. Validate required fields → `fail(400)` if missing.
3. Wrap DB ops (`.insert`/`.update`/`.delete`) in `try/catch`.
4. Verify mutation succeeded (`lastInsertRowid` or array length for LibSQL/Turso) → `fail(500)` if not.
5. Await `syncTurso()` (LibSQL/Turso projects).
6. Return: `{ action: 'actionName', success: true, message: 'Success message' }`
7. Catch returns: `fail(500, { action: 'actionName', success: false, message: 'Failed to ...' })`
8. Create actions named `new*` — consistent with frontend `formSubmit`.

## Backend Conventions (+server.ts / API Routes)
Applies to every `/src/routes/api` file and any `+server.ts` endpoint.
- **Imports:** same order as `+page.server.ts`.
- **Variables/helpers:** after imports, before exported handlers.
- **Handlers:** one `const` per supported verb: `export const GET: RequestHandler = ...`, `export const POST: RequestHandler = ...`. If two verbs share identical logic (e.g. cron via GET or POST), define one handler function and assign to both exports.
- **Auth for external endpoints:** anything called by non-app code (cron, webhooks, third-party callbacks) MUST check a shared secret via header/query param, `error(401, 'Unauthorized')` on mismatch. Never leave open.
- **DB ops:** `try/catch`; on failure `error(500, 'message')` — never a bare `Response`. Await `syncTurso()` after successful mutations.
- **Responses:** `json({...})` with a consistent, predictable shape (e.g. `{ success, found, sent, failed }`).
- Route Path Comment and Component Instructions header apply here as everywhere in `/src/`.

## Template & Directory Structure
- Three main layout templates: `(dashboard)`, `(login)`, `(app)`.
- Components exclusive to `(dashboard)` → `/src/lib/dashboardComponents`.
- Components exclusive to `(app)`/client → `/src/lib/appComponents`.
- Shared / other-template components → `/src/lib/components`.
- `(dashboard)` typically has a `sidebar`; `(app)` a `navbar`; `(login)` no navigation.
- All API routes live in `/src/routes/api`.

## Storage & Assets
- `/data` — local database files.
- `/uploads` — dynamic files (user/app uploads, written files). Not compiled during `npm run build` (unlike `/static`).

## Deep Nested Routing
- SvelteKit routing is folder-based and highly nested — search RECURSIVELY into child folders; never stop at `/src/routes/` root.
- Layout Groups in parentheses (e.g. `(dashboard)`) organize files without affecting URLs.
- Dynamic params in brackets (e.g. `[company_id]`).
- Mapping example: `http://localhost:5173/dashboard/12345` → `/src/routes/(dashboard)/dashboard/[company_id]/+page.svelte`.
- Always dig to the paired `+page.svelte` and `+page.server.ts`.

## UI/UX
- **DaisyUI 5.7** + **Tailwind CSS 4.3** — craft visually stunning UIs.

## Database Integration
- **Turso / SQLite / LibSQL** with **Drizzle ORM**, or **MongoDB** with **Mongoose ORM**.

## State Management (Svelte 5 Runes)
- Favor Runes (`$state`, `$derived`) over `svelte/store`.
- Universal cross-component client state: writable stores in `/src/lib/state.ts`, readable stores in `/src/lib/data.ts`.
- `$effect` cardinality & placement → Frontend Conventions → **$derived vs $effect** (defined there only).
- Server-side state → Key Rules (no global reactive state/stores in `/src/lib/server/`; defined there only).

---

## ⛔ FINAL REMINDER — same gate as the top of this file
Before your next tool call:
1. If it is a write to a source file (`patch`, `write`, `edit`, `create_file`, any file-mutating tool) and the user's latest message is NOT exactly `ok proceed` (trimmed, case-insensitive, standalone) — **STOP**. Do not make that call. There is no implicit approval — a follow-up is feedback, not permission, and a message that merely mentions the phrase does not approve. The one permitted pre-approval write is `.plan/todo.md` itself, during planning.
2. If it is a write to ANY file not listed in the approved plan's File/folder plan — **STOP**. Scope never self-expands; propose a plan revision instead.
3. If it is `delete_file` / rename / move — **STOP** unless that exact path is flagged `DELETE:`/`RENAME:` in the approved plan AND you state `Destructive op — <path>: authorized by T-<n>.<k>` inline first. Never assume a file is unused/dead/duplicate.
Only exception to (1): a message that is exactly "continue" while `.plan/todo.md` still has an unchecked `- [ ]` item — for that incomplete list only.
