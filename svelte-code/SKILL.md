---
name: svelte-code
description: Universal Svelte 5 / SvelteKit coding standards, plus the plan/GOTCHAS.md + plan/TODO.md read/scaffold/update protocol (mirrors svelte-plan). Use when planning, writing, reviewing, or modifying ANY Svelte code.
category: svelte
---

# Svelte 5 / SvelteKit Coding Standards

Refer to the rules outlined here verbatim when addressing architectural implementation patterns. Never over-engineer - write the minimal functional solution following strict YAGNI principles, terse and secure, no verbose explanation unless asked.

## Loading Rules

Always load this skill before writing Svelte code. Always check `plan/spec.json` and `plan/TODO.md` before scanning the codebase or drafting a plan. Before writing, modifying, or reviewing any Svelte code, `plan/GOTCHAS.md` AND `plan/TODO.md` must be read IN FULL and the Plan Files Check line printed (Plan Files Gate below) - no code is written without it. Always run `mcp__svelte__svelte_autofixer` before sending Svelte code. (Server setup: official Svelte remote — `hermes mcp add svelte --url https://mcp.svelte.dev/mcp`, answer no-auth + enable all 4; MCP tools load at SESSION START, a new session is needed after adding; verify with `hermes mcp test svelte`.) Domain references bundled with this skill: `references/svelte-ai-prompts.md` (Svelte MCP prompts), `references/drizzle-orm-turso-libsql.md`, `references/mongodb-mongoose.md`.

## Plan Files Gate - read, scaffold, update (same protocol as svelte-plan)

Before writing, modifying, or reviewing any Svelte code, read `plan/GOTCHAS.md` AND `plan/TODO.md` IN FULL - re-read in every session/turn, never cached as "already know it". Then print the counts and status inline, not a bare YES/NO - this line is the recovery anchor a fresh or post-compression session reconstructs full protocol state from, so it must carry real numbers, never placeholders:

```text
Plan files check: GOTCHAS (37 entries) + TODO (T-9 [APPROVED], 5/12 done) read in full → YES.
```

No live list yet → replace the TODO clause with `no live list`. No gotchas yet → `0 entries`.

**NO** → STOP. Do not write or modify any Svelte code until both files are read. A coding turn without a fresh printed check line is ungated - re-read both files and print the line again before continuing.

**Missing files** - if `plan/` doesn't exist, create it. If `plan/GOTCHAS.md` doesn't exist, create it now with just the sentinel block below, then continue with "sentinel only, nothing to review yet" - an empty master list is expected on a first run.

### Gotchas & Bugs - master list (read first)

`plan/GOTCHAS.md` exists but is unreadable/corrupt → STOP and ask the user how to proceed. `plan/TODO.md` exists but is unreadable/corrupt → same treatment: STOP and ask, never silently recreate it - an APPROVED list's checkboxes and summaries would be destroyed. If `plan/TODO.md` doesn't exist, create it - no Summary blocks yet (nothing completed), just the current `## Todo List T-<n> - <title> - <YYYY-MM-DD> [PENDING]` section for the work at hand (`T-1` if the project is new, otherwise highest `T-<n>` referenced anywhere in `plan/GOTCHAS.md` or `plan/TODO.md` + 1 - IDs are never reused). Neither missing file is ever a reason to stop and ask - only a corrupt one is.

**File layouts** (fixed order, top to bottom)

`plan/GOTCHAS.md`:
- (ALWAYS) read plan/GOTCHAS.md and plan/TODO.md
- (T-<n>) <gotcha, or bug → root cause → fix>

`plan/TODO.md`:
### Summary - General (T-1..T-<k>)
<real summary paragraph>
### Summary - T-<n>
<real summary paragraph>
### Summary - T-<n+1>
<real summary paragraph>
## Todo List T-<n+2> - <title> - <YYYY-MM-DD> [PENDING]
Request: <one line>
- [ ] T-<n+2>.1 - <hyper-atomic task> (convention: <[stable-id] if one exists, else free-text citation>)

(more than one `## Todo List` block can be present at once - see Concurrent lists below.)

- **Convention IDs** - cite by stable id where one exists (`convention: [bind:value]`), not free paraphrase - ids survive compression far better than restated rule text. A handful of Key Rules / Frontend / Backend Conventions already carry an `[id]` tag (`[bind:value]`, `[each-key]`, `[formSubmit-single]`, `[action-verify]`) - use those when they apply, tag new rules with an id as you add them, and only backfill an existing untagged rule once it's actually being cited, not all at once.
- **Master list** (`plan/GOTCHAS.md`) - every gotcha/bug ever logged lives here, permanently, and only here. The sentinel item is never deleted, folded, or reworded. A duplicate merges into the existing item as `⚠ REPEATED: violated again in T-<n>, fixed by <fix>` - never a parallel entry. Wording may compress; nothing is ever deleted.
- **Live gotcha capture** - the moment a gotcha or bug is hit and fixed (mid-task, at any point after drafting begins - including pre-approval research, not just after approval or at list completion), append it to `plan/GOTCHAS.md`'s master list immediately, same turn, tagged `(T-<n>)`. State it when it happens: `Gotcha logged: T-<n> → <one line>.` A gotcha discovered and fixed but not logged the same turn is not recorded, and a later task - or a future list - can repeat it.
- **Todo flips** - flip `- [ ]` → `- [x]` the instant a task finishes, same turn, and state it: `Todo update: T-6.3 → [x].` A done task with no flip is not recorded. IDs: highest `T-<n>` referenced anywhere in `plan/GOTCHAS.md` or `plan/TODO.md` + 1 for a new list (start `T-1` if both files are new/empty); never reused.
- **Append-only after approval** - the only edits permitted on an APPROVED list are: flipping a task's own checkbox, marking a task or (only on explicit user instruction) a whole list `[~]`, appending/merging entries into `plan/GOTCHAS.md`'s master list, writing/folding summary paragraphs in `plan/TODO.md`, deleting a just-completed list's checklist (in `plan/TODO.md`) after its summary is written, deleting an abandoned list's task lines. Nothing else is ever rewritten in either file.
- **Summaries** (`plan/TODO.md`) - capped at 1 General block + 2 recent individual `### Summary - T-<n>` blocks. Each block is a real summary, not a one-line changelog and never a per-task write-up: a short prose paragraph that explains what was actually built or changed and why, the way you'd brief a teammate who missed the work - never "T-9.1 did X, T-9.2 did Y." Never sub-headers, never a "What changed / Gotchas / pitfalls" breakdown. Gotchas and bugs live ONLY in `plan/GOTCHAS.md`'s master list - never restated, even compressed, inside a Summary block. The General block is one real summary of the most important changes across `T-1..T-<k>` - never a per-task write-up. On every completion, state the check regardless of outcome. Over the cap: fold the oldest individual summary into General by rewriting General as one coherent paragraph that absorbs it - never by appending the old text underneath - e.g. `Summary bound check: 3 individual → folded T-9 into General → now General + T-10, T-11.` Within the cap: still state it, e.g. `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced. Live Todo List blocks stay beneath the summaries, in creation order, for as long as each is PENDING or APPROVED-but-incomplete - see Concurrent lists below for more than one at once.
- **Lifecycle:** PENDING → APPROVED → COMPLETED or ABANDONED - a list closes exactly these two ways, never a third. **Approval** flip the header's status tag `[PENDING]` → `[APPROVED]` in `plan/TODO.md`, same turn, and state it: `T-9 approved.` A list with no `[APPROVED]` tag in the file is PENDING regardless of anything said earlier in the conversation - the tag, not the conversation, is the source of truth after a compression. Once APPROVED, the list is frozen per the append-only rule above. On completion (every item `[x]`): confirm every gotcha hit during the list is already in `plan/GOTCHAS.md`'s master list per Live gotcha capture - log any straggler now - append the summary paragraph to `plan/TODO.md`, delete the checklist entirely, enforce the summary cap - same turn, before any new request. Bump `package.json` version (patch) once per request-chain, not once per individual list: skip the bump if this list is one chunk of a chain with more chunks still pending (see Scope chunking below), and fire it only when the chain's last chunk completes. ABANDONED only on explicit user instruction: mark the header `- [~] List abandoned by user request: <reason>`, delete its task lines, keep the header line. The agent never abandons or supersedes a list on its own initiative - not to tidy up, not to route around a mistake, not because a new request seems more relevant.
- **Abandoned task** (a single task, not the whole list): mark `- [~] <task> - superseded by T-<n>.<k>: <reason>` - never delete.
- **Interrupted session** - an unchecked `- [ ]` item found in `plan/TODO.md` on read: message is exactly `continue` (standalone) → resume from the next unchecked item, but only if the list's header tag is `[APPROVED]`. If the tag is still `[PENDING]`, `continue` cannot resume work - a PENDING list was never frozen, so nothing on it is safe to execute; print the drafted plan again and ask for approval first, the same as a fresh draft. A new request instead → mandatory notice first: `Note: T-6 is still incomplete (4/7 done) - say "continue" to resume, or I'll proceed with this new request instead.` Never silently start new work over an unmentioned incomplete list - if the user proceeds with the new request, the old list is left in place per Concurrent lists, never deleted or marked abandoned on the agent's own initiative.
- **Concurrent lists** - if the user proceeds with a new request instead of resuming the incomplete one, the old list is NOT touched, deleted, or silently abandoned - it stays exactly as it is (still APPROVED, whatever boxes are already checked) in `plan/TODO.md`, and the new list is appended as its own `## Todo List T-<n>` block below it. Each keeps its own heading, `Request:` line, and checkboxes, and each is completed/abandoned independently. State it when it happens: `T-6 left in place (4/7 done, paused) - drafting T-9 alongside it.` If more than one incomplete list exists, bare `continue` is ambiguous - list each incomplete `T-<n>` with its done/total count and ask which one, unless the message already names one (e.g. `continue T-6`).
- **Scope chunking** - a draft scope over roughly 12 hyper-atomic tasks is capped, not drafted as one giant list: split it into sequential `## Todo List` blocks (e.g. `T-9` (12 tasks), `T-10` (12), `T-11` (10)), get the first chunk approved and completed, then draft the next. State it when it happens: `Scope chunked: 34 tasks → T-9 (12), T-10 (12), T-11 (10) - starting T-9.` Fold the chain into every chunk's `Request:` line itself, not just spoken in the turn - e.g. `Request: <text> (chunk 1/3; T-10, T-11 planned)` - so a session that compresses between T-9 completing and T-10 being drafted still knows, from the file alone, that the request isn't finished. Chunks are exempt from the Self-heal merge rule below - they are deliberately multiple lists for the same request, not a duplication to consolidate. This is the mechanism for handling oversized scope, in place of any per-task sub-task list: tasks are already mandated hyper-atomic, so a sub-checklist under one would fight that same-file's own YAGNI rule and add a second mandatory read every turn for no benefit a flat, chunked list doesn't already give.
- **Working notes** - an optional `### Working notes - T-<n>` block directly under a list's checklist, for what belongs in neither `plan/GOTCHAS.md` (not a bug/gotcha) nor a Summary (not a finished-work write-up): user clarifications mid-list, the approach chosen among alternatives, bits explicitly deferred. Editable even while the list is APPROVED (added to the allowed-edits list in Append-only after approval, above). At list completion, promote anything durable into `plan/GOTCHAS.md` or fold it into the Summary paragraph, then delete the block along with the rest of the checklist - it never persists past its own list. If a task turns out non-atomic once work on it starts, split it into new sibling tasks appended to the same list (`T-9.4`, `T-9.5`...) rather than a sub-list or child hierarchy under the original task - the list stays flat, and nothing new needs a mandatory read.
- **Size management** - `plan/GOTCHAS.md` has no entry cap and nothing is ever deleted, but it's read in full before every coding session, so unchecked growth eventually makes that read slow and expensive. Count entries every time the Plan Files Check line is printed (see the check line above) rather than eyeballing it - once the count hits 40-50 entries: consolidate first - merge near-duplicate gotchas into one entry, tighten wording, collapse long `⚠ REPEATED` chains down to their current fix - state it: `Gotchas size check: consolidated <n> entries → <m>.` If consolidation alone doesn't bring it back to a comfortable size, archive: move entries tied to areas the current codebase no longer touches (a removed integration, a deprecated route) into `plan/GOTCHAS-ARCHIVE.md`, leaving a one-line pointer in the master list - `- (ARCHIVED, see plan/GOTCHAS-ARCHIVE.md) <area> - <n> entries.` `plan/GOTCHAS-ARCHIVE.md` is NOT part of the mandatory every-code read - read it only when the current work touches an archived area, or the user asks. Archiving is never deleting: every entry that leaves the master list is still findable, in full, in the archive file.
- **Self-heal on read** (first write of the session, before any code edit): multiple master lists or gotchas scattered outside `plan/GOTCHAS.md` → consolidate into one there; more than 2 individual summaries in `plan/TODO.md` → fold to the cap; multiple pending (never-approved) lists for the same request → merge into one under the earliest `T-<n>`, discard the rest (no `[~]` record needed - they were never approved) - **except** lists whose `Request:` line marks them as chunks of the same scope chain (see Scope chunking above), which are left exactly as they are.

## Post-Change Verification

Every edit, no exceptions, in order:

1. Diff check first. `git diff -- <file>` (or pre/post content diff if not a git repo) - read the actual diff, never rely on memory. Scan every `-` line for a removed comment (`//`, `/* */`, `<!-- -->`, `#`) - any found, restore before moving on. Cross-check `-` / `+` lines against this plan's Known constraints (the specifics fixed in this list's `Request:` line and any Working notes for it) - fix any contradiction in the same tool-call cycle. State: `Diff check - <file>: no comments removed, no known-constraint violations.` A write with no stated result is unverified. Runs on every edit, including markup-only - those most often silently drop comments.
2. `mcp__svelte__svelte_autofixer` on every modified `.svelte` file - cheap, single-file, always.
3. Re-diff after the autofixer: `git diff -- <file>` again on every file the autofixer touched, scanning its own `-` lines for a removed comment the same way as step 1 - step 1 runs before the autofixer and never sees what the autofixer itself rewrites or drops, so this step is what actually catches it. State: `Autofixer re-diff - <file>: no comments removed.`
4. `npm run check` only when type-relevant: script logic/props/events, `+page.server.ts`/`+server.ts`, a shared type, or a DB schema. Skip for markup/class/copy-only edits. Batch it across several small type-relevant tasks rather than running it after each one, unless a task touches a shared type/schema and needs an isolated check first.
5. `npm run build` only for new dependencies or `vite.config`/adapter changes - never routinely.
6. Confirm zero NEW errors (pre-existing ones are acceptable but must be called out).

Update `plan/spec.json` in the same turn a task's checkbox flips, per the rule above. That same turn, per the Plan Files Gate: flip the completed task's checkbox in `plan/TODO.md` (`Todo update: T-<n>.<k> → [x].`) and append any just-fixed gotcha/bug to `plan/GOTCHAS.md` (`Gotcha logged: T-<n> → <one line>.`) - neither is deferred to end-of-session or list completion.

Runtime-only failures pass typecheck. `svelte-check`/`npm run check` catch neither const-`$state` rebinds nor SSR-only TDZ (`$derived`/closures reading a var declared later in the file) nor a feature whose only UI entry point never actually runs - after any non-trivial change, boot the dev server and click through the affected page/flow before calling it verified.

## Key Rules

- Comments are permanent - never delete one, including dormant commented-out boilerplate kept for future forks; checked mechanically via the diff step, never by memory. One that's factually wrong after a change can be updated but removal still needs explicit user confirmation, stated openly - never removed silently.
- Files are permanent by default - same logic: never delete/rename/move because something "looks" unused, duplicate, dead, or legacy. Deletion requires an explicit `DELETE:` entry in the approved plan plus the user's explicit confirmation of that specific entry, restated or quoted in the same turn - never inferred from silence or from the list's general approval. When in doubt, comment out or deprecate.
- Prefer Context7 MCP for DaisyUI/Tailwind/Drizzle docs over local `.txt` files.
- Svelte 5 Runes (`$state`, `$derived`) over `svelte/store` for reactivity.
- `const x = $state(...)` can be mutated but never rebound - reassignment (`x = new Set(...)`, `x = {}`) needs `let x = $state(...)` or Svelte throws `Cannot assign to constant`.
- No global reactive state/stores in `/src/lib/server/` - server state must be stateless per-request, or one client's data can leak into another's response. Exception: large read-only reference data shared by everyone (countries, cities, names).
- **[bind:value]** `bind:value` (`bind:checked` / `bind:group` for checkboxes/radios), never one-way `value={...}`, for editable inputs seeded from server `load` data - `use:enhance` resets fields to `defaultValue` (baked at first render) on success; one-way `value` never updates that baseline, so fields silently revert to stale data even after `invalidateAll()`. Plain `value={...}` is fine for genuinely display-only content.
- **[each-key]** Every `{#each}` over a dynamic/mutable array needs a unique key: `{#each array as item, i (item.uniqueId)}` - index keys cause DOM state bugs on reorder/delete. Omit the key only for fully static, hardcoded arrays.
- When filtering an array for display but mutating/removing by array index (e.g. `removeLine(index)`), pass the row's stable id instead of the filtered index - indexes drift between the filtered view and the full array, so it deletes the wrong row.
- Any `<form>` containing `<input type="file">` or a drag-and-drop upload component needs `enctype="multipart/form-data"` - without it the form still submits with no error, but the file is silently missing from `request.formData()` server-side.
- Parse-error traps: `class:foo/bar={cond}` (directive name containing `/`) fails - use a ternary on `class={...}` instead; `{/* */}` inside an element's attribute list fails - comments go outside the tag; a missing comma between blocks in `export const actions = {...}` breaks the generated proxy - re-check after adding any action.
- Absolutely-positioned dropdown/suggestion lists get clipped inside an `overflow-x-auto` ancestor (e.g. a grid) - use a native `<datalist>` there instead of a custom-positioned picker. A focus-driven DaisyUI dropdown (`:focus-within`) needs the trigger blurred on close, or it won't close on a second click.
- **[formSubmit-single]** One `formSubmit` per page via `use:enhance={formSubmit}` (never `{formSubmit()}` or separate per-form handlers) - splitting handlers fragments the notification/reset logic and drifts inconsistent over time.
- Create actions named `new*`, matching frontend `formSubmit` conventions.
- **[action-verify]** Server actions: validate → try/catch the DB op → verify the mutation actually landed (`lastInsertRowid` or array length) → `syncTurso()` (Drizzle projects) → return `{ action, success: true, message }`; catch returns `fail(500, { action, success: false, message })`. Skipping the post-write verification step is how silent data-loss bugs happen.
- Validation is always server-side even when the UI already enforces it (client checks are UX only), and any switch/branch on an enum/variant column must handle every value the DB constraint allows, not just the ones the current UI offers.
- A delete action whose row has children in other tables needs an explicit cascade in the same action (or `ON DELETE CASCADE`) - otherwise the children are orphaned and accumulate silently.
- `use:enhance`'s callback receives `result: ActionResult` already deserialized; a raw `fetch()` against an action endpoint gets back `devalue`-encoded text instead, parse it with `deserialize()` / `devalue.parse()`. Either way, `fail()` always returns HTTP 200 with the status embedded in `result.data` - never branch on the raw HTTP status.
- API routes reachable by cron, webhooks, or third-party callbacks must check a shared secret via header/query param, `error(401, 'Unauthorized')` on mismatch - an unauthenticated external endpoint is an open door.
- `+layout.server.ts` LOAD guards protect pages only - they never run before a POST action, and never run for `+server.ts` children. Every action/endpoint re-validates auth/ownership itself; never assume the layout already covered it.
- Any filesystem path assembled from request input (upload/download endpoints) needs component-level sanitization (reject `.`/`..` segments) plus a resolved-path containment check, on every HTTP verb that touches it.
- Any new session/auth-state-writing action seeds every column a sibling path seeds (e.g. every expiry/tracking field together) - a partially-seeded row makes an unrelated downstream check silently fail.
- Cloning an existing CRUD route copies its stale success/error messages AND its (missing) ownership guards along with the logic - sweep both on every clone, not just the parts you meant to change.
- Reuse `/src/lib/clientUtils.ts` / `/src/lib/server/serverUtils.ts` before writing a new helper; multi-use utilities (e.g. `syncTurso()`) are a single shared export, never redefined inline.
- **Route Path Comment** at the top of every `/src/` file, stating its own relative path - the comment syntax depends on file type, never mix them up:
  - Server (`.ts`) files: `// src/routes/api/download-csv/+server.ts`
  - Frontend (`.svelte`) files: `<!-- // src/routes/(dashboard)/dashboard/[company_id]/+page.svelte -->`
- Also add a Component Instructions `<!-- // INSTRUCTIONS -->` block above `<script lang="ts">` on every file in `src/lib/components` (usage, auth requirements, non-obvious assumptions) - so a future agent and users can orient.
- DB queries and secured external fetches happen only in `+page.server.ts`/`+server.ts`, never `+page.svelte` - keeps credentials and query logic off the client bundle.
- Any report/listing query filters out soft-deleted/voided rows the same way the write path does, from the first version of the query - if the filter is added later, sweep it into every existing query over that table too.
- No `try/catch` with an empty `catch`. No `[cite_start]` or citation text inside code blocks. Always `const` for function definitions and exports. Redact secrets as `[REDACTED]`, never inline.
- `new Date('')` (empty/invalid string) silently becomes `NaN` downstream - guard optional date fields with a fallback before constructing `Date`. Pushing to an array before its own later `const` declaration in the same scope is a TDZ `ReferenceError` at runtime that type-checkers miss - hoist declarations above first use. `array.flatMap(async fn)` returns unresolved Promises, not flattened results - use `(await Promise.all(array.map(fn))).flat()`.
- `as const` on a numeric array makes a readonly tuple that breaks `.includes()` against a wider number type - use `readonly number[]` instead. `!res.ok` doesn't narrow a discriminated union (`{ok:true}|{ok:false,message}`) under non-strict TS - compare explicitly (`res.ok === false`).
- `toISOString().slice(...)` for date/month defaults is UTC and drifts near local midnight - always go through a canonical local-timezone helper, never raw UTC slicing.
- Svelte code blocks: the logic is written inside `<script lang="ts">`, but mark the markdown fence `typescript` or `javascript` - never `svelte` - when presenting the code.

## Frontend Conventions

- Imports order: `$env/...` → `svelte`/`$app/...` → npm modules → `$lib/...` → `lucide-svelte` last.
- **Props:**

  ```typescript
  let { data } = $props();
  const { getTable, company_id, tree } = $derived(data);
  ```

- Page structure: `<svelte:head><title>` for the page name, plus a `<noscript>` fallback directly above the main markup:

  ```html
  <noscript>
  	<h1 style="font-weight:700; text-align: center;">Please enable Javascript to continue.</h1>
  	<style type="text/css">#main-content { display: none; }</style>
  </noscript>
  ```

- Modal state + click handler:

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

- One `onResetFields()` per page resets every form-related `$state` field to its initial value - called from `onClickModal` (before setting the new modal/`currentObj`) and from `formSubmit`'s `finally`:

  ```typescript
  const onResetFields = () => {
  	selectedClientId = '';
  	clientName = '';
  	clientPhone = '';
  	clientEmail = '';
  };
  ```

- Named partial resets (`onResetSearchFields`, `onResetAddressFields`) only when a genuinely independent sub-form needs one, each resetting a complete scoped group - never a shortcut around maintaining the main `onResetFields`.
- Modals always render last in the markup:

  ```html
  {#if currentModal === 'newAccount'}
  	<Modal isOpen={openModal} header={modalTitle} cssClass="max-w-2xl">
  	</Modal>
  {/if}
  ```

- `Modal` is a shared imported component (e.g. `$lib/components/Modal.svelte`) - this exact usage shape (`isOpen`/`header`/`cssClass` props, `{#if}` wrapper) is what stays identical across every project, not just the surrounding state variables.
- `formSubmit` - ONE per page handles ALL form submissions and notifications; never separate per-form handlers (`calendarSyncSubmit`, `profileSubmit` - forbidden). Every server action returns a unique `action` string in `result.data`, and `use:enhance={formSubmit}` on every `<form>` (never `{formSubmit()}`). Update reactive state inside the `if (action === '...')` blocks when a given action needs custom handling:

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

- **Editable Input Bindings** (`bind:value`): any editable `<input>` / `<select>` / `<textarea>` sourced from server `load` data uses `bind:value` against a local `$state` seeded from that data - never one-way `value={...}`:

  ```typescript
  let name = $state(user.name ?? '');
  ```

  ```html
  <input id="name" name="name" bind:value={name} />
  ```

  - **Why:** `use:enhance` calls native `form.reset()` on success, resetting fields to `defaultValue` (baked at first render). One-way `value={...}` never updates `defaultValue`, so fields silently revert to stale data even after `invalidateAll()`. Plain `value={...}` is fine only for genuinely display-only content.

- **`$derived` vs `$effect`** (canonical definition, referenced elsewhere): favor `$derived`. Usually exactly one `$effect` per page/component - multiple only when combining would cause dependency interference. Every `$effect()` sits at the bottom of `<script lang="ts">`, below `formSubmit` if one exists. Never mutate a stored/source value just to reformat it for display (e.g. a price-mode toggle) - recompute the display inside `$derived` and leave the source alone, or repeated round-trips drift.

- **`$state`+`$effect` recompute → `$derived`:** if `$effect()` only reassigns a `$state` var from other reactive values, use `$derived`/`$derived.by()` instead (writable since Svelte 5.25). Keep `$effect` only for real side effects (DOM, `fetch`, logging, timers). → (https://sveltejs.github.io/eslint-plugin-svelte/rules/prefer-writable-derived/)
  - ❌ `$state` + `$effect(() => { x = f(y); })`
  - ✅ `$derived(f(y))`

## Backend Conventions

- `+page.server.ts` structure: environment imports (`$env/static/private`, etc.) explicitly at the top → `const`/`let`, helpers, DB instantiation → then `load`, then all actions grouped at the bottom:

  ```typescript
  export const load: PageServerLoad = async ({ params, locals, url }) => { ... }
  export const actions: Actions = { ... }
  ```

- Server Actions Pattern: fetch/parse `request.formData()` → validate required fields, `fail(400)` if missing → wrap DB ops (`.insert` / `.update` / `.delete`) in `try/catch` → verify the mutation succeeded (`lastInsertRowid` or array length for LibSQL/Turso), `fail(500)` if not → await `syncTurso()` (LibSQL/Turso projects) → return `{ action: 'actionName', success: true, message: 'Success message' }`; catch returns `fail(500, { action: 'actionName', success: false, message: 'Failed to ...' })`.
- `+server.ts` / API routes - applies to every `/src/routes/api` file and any `+server.ts` endpoint: same import order as above; variables/helpers after imports, before handlers; one `const` per verb (`export const GET: RequestHandler = ...`, `export const POST: RequestHandler = ...`) - if two verbs share identical logic, define one function and assign it to both exports; shared-secret auth for externally-triggered endpoints, never leave one open; DB ops in `try/catch`, `error(500, 'message')` on failure - never a bare `Response`; await `syncTurso()` after successful mutations; `json({...})` with a consistent, predictable shape (e.g. `{ success, found, sent, failed }`); Route Path Comment and Component Instructions apply here too.

## Project Structure

Three layout templates: `(dashboard)` (has a sidebar), `(page)` (no navigation), `(app)` (has a navbar). Components exclusive to `(dashboard)` → `/src/lib/dashboardComponents`; exclusive to `(app)` /client → `/src/lib/appComponents`; shared or other-template → `/src/lib/components`. All API routes live in `/src/routes/api`. `/data` holds local database files; `/uploads` holds dynamic user/app-generated files and is not compiled during `npm run build` (unlike `/static`).

SvelteKit routing is folder-based and deeply nested - search recursively into child folders, never stop at `/src/routes/` root. Layout groups in parentheses (`(dashboard)`) organize files without affecting URLs; dynamic params use `[brackets]`. Example: `http://localhost:5173/dashboard/12345` → `/src/routes/(dashboard)/dashboard/[company_id]/+page.svelte`. Always dig to the paired `+page.svelte` and `+page.server.ts`. `resolve()` / `goto()` don't validate that the target route id exists - a typo'd path resolves fine and 404s only at runtime. Components persist across navigation between different values of the same dynamic param (`[company_id]`) with no automatic remount - module-level stores/`$state` can leak the previous param's data into the new page; use `{#key company_id}` or re-derive the relevant state inside an `$effect` keyed on the param.

## Stack

DaisyUI 5.7 + Tailwind CSS 4.3 for UI. Turso/SQLite/LibSQL with Drizzle ORM, or MongoDB with Mongoose, for data. Favor Runes (`$state`, `$derived`) over `svelte/store`; when genuine cross-component client state is needed, writable stores go in `/src/lib/state.ts`, readable stores in `/src/lib/data.ts`.
