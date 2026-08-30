name: universal-code
description: Language-agnostic coding standards, plus the plan/GOTCHAS.md + plan/TODO.md read/scaffold/update protocol. Use when planning, writing, reviewing, or modifying code in ANY language or framework.
category: engineering

# Universal Coding Standards

Refer to the rules outlined here verbatim when addressing architectural implementation patterns. Never over-engineer - write the minimal functional solution following strict YAGNI principles, terse and secure, no verbose explanation unless asked.

## Stack Detection (first, every project)

Before scanning the codebase or writing anything, detect the stack from project manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `composer.json`, etc.) and record it in `plan/spec.json`: language(s), framework + version, router, state model, ORM/DB, styling system, and the canonical autofix / typecheck / build / test commands. Apply the general rules below plus the detected stack's idiomatic conventions. Never invent idioms for a stack you haven't detected - ask, or consult docs via MCP. Bundled domain references (e.g. `references/svelte-ai-prompts.md`, `references/drizzle-orm-turso-libsql.md`, `references/mongodb-mongoose.md`) are loaded only when they match the detected stack.

## Loading Rules

- Always load this skill before writing code. Always check `plan/spec.json` and `plan/TODO.md` before scanning the codebase or drafting a plan.
- Before writing, modifying, or reviewing any code, `plan/GOTCHAS.md` AND `plan/TODO.md` must be read IN FULL and the Plan Files Check line printed (Plan Files Gate below) - no code is written without it.
- Always run the project's canonical autofix command (from `plan/spec.json`) on changed files before sending code - e.g. `mcp__svelte__svelte_autofixer` (Svelte), `prettier` + `eslint --fix` (JS/TS), `ruff`/`black` (Python), `gofmt` (Go), `rustfmt` + `clippy` (Rust). None configured → say so; don't invent one.
- Prefer docs MCPs (Context7 or equivalent) for framework/library docs over local `.txt` files.

## Plan Files Gate - read, scaffold, update

Before writing, modifying, or reviewing any code, read `plan/GOTCHAS.md` AND `plan/TODO.md` IN FULL - re-read in every session/turn, never cached as "already know it". Then print:

Plan files check: plan/GOTCHAS.md + plan/TODO.md read in full → past gotchas known, current/incomplete task list known. YES/NO.

NO → STOP. Do not write or modify any code until both files are read. A coding turn without a fresh printed check line is ungated - re-read both files and print the line again before continuing.

Missing files - if `plan/` doesn't exist, create it. If `plan/GOTCHAS.md` doesn't exist, create it now with just the sentinel block below, then continue with "sentinel only, nothing to review yet" - an empty master list is expected on a first run, not a block:

Gotchas & Bugs - master list (read first)

`plan/GOTCHAS.md` exists but is unreadable/corrupt → STOP and ask the user how to proceed. If `plan/TODO.md` doesn't exist, create it - no Summary blocks yet (nothing completed), just the current `## Todo List T-<n> - <title> - <YYYY-MM-DD>` section for the work at hand (`T-1` if the project is new, otherwise highest `T-<n>` referenced anywhere in `plan/GOTCHAS.md` or `plan/TODO.md` + 1 - IDs are never reused). Neither missing file is ever a reason to stop and ask.

## File layouts (fixed order, top to bottom)

`plan/GOTCHAS.md`:

Gotchas & Bugs - master list (read first)
(ALWAYS) Apply the planning protocol in full - hard gate, plan/TODO.md first, exact "ok proceed" approval, scope lock, destructive-op flags, conventions loaded from this skill.
(T-<n>) <gotcha, or bug → root cause → fix>

`plan/TODO.md`:

Summary - General (T-1..T-<k>)
<real summary paragraph>
### Summary - T-<n>
<real summary paragraph>
### Summary - T-<n+1>
<real summary paragraph>
## Todo List T-<n+2> - <title> - <YYYY-MM-DD>
Request: <one line>
- [ ] T-<n+2>.1 - <hyper-atomic task> (convention: <cited convention>)

(more than one `## Todo List` block can be present at once - see Concurrent lists below.)

Master list (`plan/GOTCHAS.md`) - every gotcha/bug ever logged lives here, permanently, and only here. The sentinel item is never deleted, folded, or reworded. A duplicate merges into the existing item as `⚠ REPEATED: violated again in T-<n>, fixed by <fix>` - never a parallel entry. Wording may compress; nothing is ever deleted.

Live gotcha capture - the moment a gotcha or bug is hit and fixed during implementation (mid-task, at any point after approval, not just at list completion), append it to `plan/GOTCHAS.md`'s master list immediately, same turn, tagged `(T-<n>)`. State it when it happens: `Gotcha logged: T-<n> → <one line>.` A gotcha discovered and fixed but not logged the same turn is not recorded, and a later task - or a future list - can repeat it.

Todo flips - flip `- [ ]` → `- [x]` the instant a task finishes, same turn, and state it: `Todo update: T-6.3 → [x].` A done task with no flip is not recorded. IDs: highest `T-<n>` referenced anywhere in `plan/GOTCHAS.md` or `plan/TODO.md` + 1 for a new list (start `T-1` if both files are new/empty); never reused.

Append-only after approval - the only edits permitted on an APPROVED list are: flipping a task's own checkbox, marking a task or (only on explicit user instruction) a whole list `[~]`, appending/merging entries into `plan/GOTCHAS.md`'s master list, writing/folding summary paragraphs in `plan/TODO.md`, deleting a just-completed list's checklist (in `plan/TODO.md`) after its summary is written, deleting an abandoned list's task lines. Nothing else is ever rewritten in either file.

Summaries (`plan/TODO.md`) - capped at 1 General block + 2 recent individual `### Summary - T-<n>` blocks. Each block is a real summary, not a one-line changelog and never a per-task write-up: a short paragraph (2-5 sentences, prose) that explains what was actually built or changed and why, the way you'd brief a teammate who missed the work - never "T-9.1 did X, T-9.2 did Y." Never sub-headers, never a "What changed / Gotchas / pitfalls" breakdown. Gotchas and bugs live ONLY in `plan/GOTCHAS.md`'s master list - never restated, even compressed, inside a Summary block. The General block is one real summary of the most important changes across T-1..T-<k> - never a per-task write-up. On every completion, state the check regardless of outcome. Over the cap: fold the oldest individual summary into General by rewriting General as one coherent paragraph that absorbs it - never by appending the old text underneath - e.g. `Summary bound check: 3 individual → folded T-9 into General → now General + T-10, T-11.` Within the cap: still state it, e.g. `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced. The live Todo List block stays at the bottom of `plan/TODO.md`, beneath the summaries, for as long as it is PENDING or APPROVED-but-incomplete.

Lifecycle: PENDING → APPROVED (frozen per the append-only rule above) → COMPLETED or ABANDONED - a list closes exactly these two ways, never a third. On completion (every item `[x]`): confirm every gotcha hit during the list is already in `plan/GOTCHAS.md`'s master list per Live gotcha capture - log any straggler now - append the summary paragraph to `plan/TODO.md`, delete the checklist entirely, enforce the summary cap, bump the project version (patch) per project convention (e.g. `package.json` version) - same turn, before any new request. ABANDONED only on explicit user instruction: mark the header `- [~] List abandoned by user request: <reason>`, delete its task lines, keep the header line. The agent never abandons or supersedes a list on its own initiative - not to tidy up, not to route around a mistake, not because a new request seems more relevant.

Abandoned task (a single task, not the whole list): mark `- [~] <task> - superseded by T-<n>.<k>: <reason>` - never delete.

Interrupted session - an unchecked `- [ ]` item found in `plan/TODO.md` on read: message is exactly `continue` (standalone) → resume from the next unchecked item. A new request instead → mandatory notice first: `Note: T-6 is still incomplete (4/7 done) - say "continue" to resume, or I'll proceed with this new request instead.` Never silently start new work over an unmentioned incomplete list - if the user proceeds with the new request, the old list is left in place per Concurrent lists, never deleted or marked abandoned on the agent's own initiative.

Concurrent lists - if the user proceeds with a new request instead of resuming the incomplete one, the old list is NOT touched, deleted, or silently abandoned - it stays exactly as it is (still APPROVED, whatever boxes are already checked) in `plan/TODO.md`, and the new list is appended as its own `## Todo List T-<n>` block below it. Each keeps its own heading, `Request:` line, and checkboxes, and each is completed/abandoned independently. State it when it happens: `T-6 left in place (4/7 done, paused) - drafting T-9 alongside it.` If more than one incomplete list exists, bare `continue` is ambiguous - list each incomplete `T-<n>` with its done/total count and ask which one, unless the message already names one (e.g. `continue T-6`).

Size management - `plan/GOTCHAS.md` has no entry cap and nothing is ever deleted, but it's read in full before every coding session, so unchecked growth eventually makes that read slow and expensive. Once the file gets big (roughly 40-50 entries): consolidate first - merge near-duplicate gotchas into one entry, tighten wording, collapse long `⚠ REPEATED` chains down to their current fix - state it: `Gotchas size check: consolidated <n> entries → <m>.` If consolidation alone doesn't bring it back to a comfortable size, archive: move entries tied to areas the current codebase no longer touches (a removed integration, a deprecated route) into `plan/GOTCHAS-ARCHIVE.md`, leaving a one-line pointer in the master list - `- (ARCHIVED, see plan/GOTCHAS-ARCHIVE.md) <area> - <n> entries.` `plan/GOTCHAS-ARCHIVE.md` is NOT part of the mandatory every-code read - read it only when the current work touches an archived area, or the user asks. Archiving is never deleting: every entry that leaves the master list is still findable, in full, in the archive file.

Self-heal on read (first write of the session, before any code edit): multiple master lists or gotchas scattered outside `plan/GOTCHAS.md` → consolidate into one there; more than 2 individual summaries in `plan/TODO.md` → fold to the cap; multiple pending (never-approved) lists for the same request → merge into one under the earliest `T-<n>`, discard the rest (no `[~]` record needed - they were never approved).

## Post-Change Verification

Every edit, no exceptions, in order:

1. Diff check first. `git diff -- <file>` (or pre/post content diff if not a git repo) - read the actual diff, never rely on memory. Scan every `-` line for a removed comment in the file's comment syntax (`//`, `/* */`, `<!-- -->`, `#`, `--`, etc.) - any found, restore before moving on. Cross-check `-` / `+` lines against this plan's Known constraints; fix any contradiction in the same tool-call cycle. State: `Diff check - <file>: no comments removed, no known-constraint violations.` A write with no stated result is unverified. Runs on every edit, including markup/copy-only - those most often silently drop comments.
2. The project's canonical autofixer/linter (per `plan/spec.json`) on every modified source file - cheap, single-file, always. Svelte: `mcp__svelte__svelte_autofixer`; JS/TS: configured formatter + `eslint --fix`; Python: `ruff`/`black`; Go: `gofmt`; Rust: `rustfmt`.
3. Typecheck / static analysis only when type-relevant: script logic/props/events, server handlers, a shared type, or a DB schema. Command per stack (`npm run check`, `tsc --noEmit`, `mypy`, `cargo clippy`, `go vet`, ...). Skip for markup/class/copy-only edits. Batch it across several small type-relevant tasks rather than running it after each one, unless a task touches a shared type/schema and needs an isolated check first.
4. The project build only for new dependencies or build-config/adapter changes - never routinely.
5. Confirm zero NEW errors (pre-existing ones are acceptable but must be called out).
6. Update `plan/spec.json` in the same turn a task's checkbox flips, per the rule above. That same turn, per the Plan Files Gate: flip the completed task's checkbox in `plan/TODO.md` (`Todo update: T-<n>.<k> → [x].`) and append any just-fixed gotcha/bug to `plan/GOTCHAS.md` (`Gotcha logged: T-<n> → <one line>.`) - neither is deferred to end-of-session or list completion.
7. Runtime-only failures pass static checks. Typecheckers/linters catch neither immutable-binding reassignment, initialization-order errors (TDZ/hoisting), nor a feature whose only UI entry point never actually runs - after any non-trivial change, boot the app and click through the affected page/flow before calling it verified.

## Key Rules

### Permanence

- Comments are permanent - never delete one, including dormant commented-out boilerplate kept for future forks; checked mechanically via the diff step, never by memory. One that's factually wrong after a change can be updated but removal still needs explicit user confirmation, stated openly - never removed silently.
- Files are permanent by default - same logic: never delete/rename/move because something "looks" unused, duplicate, dead, or legacy. Deletion requires an explicit `DELETE:` entry in the approved plan plus the inline authorization statement (Hard Gate → Destructive ops). When in doubt, comment out or deprecate.

### Reactivity & state

- Prefer the language/framework's current recommended idiom over legacy patterns (Svelte 5 runes over `svelte/store`, React hooks over class components, modern typed Python over untyped) - detected per `plan/spec.json`, never invented.
- Declaration semantics matter: know what can be rebound vs mutated in the target language. E.g. Svelte 5 `const x = $state(...)` can be mutated but never rebound - reassignment (`x = new Set(...)`, `x = {}`) needs `let x = $state(...)` or the runtime throws `Cannot assign to constant`.
- No process-wide mutable state in server request paths - server state must be stateless per-request, or one client's data can leak into another's response. Exception: large read-only reference data shared by everyone (countries, cities, names).
- Favor derived/computed values over effects/watchers. Usually exactly one effect/watcher per component - multiple only when combining would cause dependency interference. Every effect sits at the bottom of the component's logic block, below the submit handler if one exists. Never mutate a stored/source value just to reformat it for display (e.g. a price-mode toggle) - recompute the display inside a derived and leave the source alone, or repeated round-trips drift.

### Forms & inputs (web)

- Two-way binding for editable inputs seeded from server load data - never one-way value binding. Progressive-enhancement form handlers (e.g. `use:enhance`) reset fields to `defaultValue` (baked at first render) on success; one-way bindings never update that baseline, so fields silently revert to stale data even after invalidation. One-way/display binding is fine for genuinely display-only content.
- Every iteration over a dynamic/mutable collection needs a unique stable key (Svelte `(item.id)`, React `key={item.id}`, Vue `:key`) - index keys cause DOM state bugs on reorder/delete. Omit the key only for fully static, hardcoded collections.
- When filtering a collection for display but mutating/removing by index (e.g. `removeLine(index)`), pass the row's stable id instead of the filtered index - indexes drift between the filtered view and the full collection, so it deletes the wrong row.
- Any `<form>` containing `<input type="file">` or a drag-and-drop upload component needs `enctype="multipart/form-data"` - without it the form still submits with no error, but the file is silently missing from the form data server-side.
- One submit handler per page handles ALL form submissions and notifications - never separate per-form handlers (`calendarSyncSubmit`, `profileSubmit` - forbidden). Splitting handlers fragments the notification/reset logic and drifts inconsistent over time. Every form wires the same handler reference via the framework's enhancement mechanism (Svelte: `use:enhance={formSubmit}`, never `{formSubmit()}`).
- One reset function per page resets every form-related state field to its initial value - called before opening a modal/setting new state and from the submit handler's `finally`. Named partial resets (`onResetSearchFields`, `onResetAddressFields`) only when a genuinely independent sub-form needs one, each resetting a complete scoped group - never a shortcut around maintaining the main reset function.
- Create/mutation endpoints are named consistently with frontend conventions (e.g. `new*` for creates).
- Framework failure semantics: many frameworks return HTTP 200 with the failure status embedded in the payload - branch on the embedded status, never on the raw HTTP code. Deserialize action results per framework (SvelteKit: `use:enhance`'s callback receives `result` already deserialized; a raw `fetch()` against an action endpoint gets back `devalue`-encoded text - parse it with `deserialize()` / `devalue.parse`).

### Server & data

- Mutation endpoint pattern: fetch/parse request input → validate required fields, `400` if missing → wrap the data op (insert/update/delete) in `try/catch` → verify the mutation actually landed (inserted id, rows-affected, or array length) → replica sync if the project has one (e.g. `syncTurso()` in Drizzle/Turso projects) → return `{ action, success: true, message }`; catch returns `fail(500, { action, success: false, message })`. Skipping the post-write verification step is how silent data-loss bugs happen.
- Validation is always server-side even when the UI already enforces it (client checks are UX only), and any switch/branch on an enum/variant column must handle every value the DB constraint allows, not just the ones the current UI offers.
- A delete action whose row has children in other tables needs an explicit cascade in the same action (or `ON DELETE CASCADE`) - otherwise the children are orphaned and accumulate silently.
- Page/route-level load guards protect reads only - they never run before POST/mutation actions, and never for API-endpoint children. Every action/endpoint re-validates auth/ownership itself; never assume the parent layout already covered it.
- API routes reachable by cron, webhooks, or third-party callbacks must check a shared secret via header/query param, `401 Unauthorized` on mismatch - an unauthenticated external endpoint is an open door.
- Any filesystem path assembled from request input (upload/download endpoints) needs component-level sanitization (reject `.` / `..` segments) plus a resolved-path containment check, on every HTTP verb that touches it.
- Any new session/auth-state-writing action seeds every column a sibling path seeds (e.g. every expiry/tracking field together) - a partially-seeded row makes an unrelated downstream check silently fail.
- Cloning an existing CRUD route copies its stale success/error messages AND its (missing) ownership guards along with the logic - sweep both on every clone, not just the parts you meant to change.
- DB queries and secured external fetches happen only in trusted server files (`+page.server.ts` / `+server.ts` in SvelteKit; equivalents elsewhere), never in client-rendered files - keeps credentials and query logic off the client bundle.
- Any report/listing query filters out soft-deleted/voided rows the same way the write path does, from the first version of the query - if the filter is added later, sweep it into every existing query over that table too.
- Reuse existing shared utility modules before writing a new helper; multi-use utilities (e.g. `syncTurso()`) are a single shared export, never redefined inline.

### Style & hygiene

- File-path header comment at the top of every source file, stating its own path from the repo root - the comment syntax depends on file type, never mix them up (`//` C-family/`.ts`, `<!-- -->` markup, `#` Python/shell/YAML, `--` SQL/Lua, etc.).
- An Instructions block (usage, auth requirements, non-obvious assumptions) at the top of every shared component/module, in the file's comment syntax - so a future agent and users can orient.
- No `try/catch` with an empty `catch`. No `[cite_start]` or citation text inside code blocks. Declare functions/exports with the language's immutable binding form where available (e.g. `const` in JS). Redact secrets as `[REDACTED]`, never inline.
- Parsing guards: empty/invalid input to parsers (`new Date('')`, `int('')`, `JSON.parse('')`) silently becomes invalid downstream - guard optional fields with a fallback before parsing.
- UTC date/month defaults (`toISOString().slice(...)` and equivalents) drift near local midnight - always go through the project's canonical local-timezone helper, never raw UTC slicing.
- When presenting code in chat/docs, mark the markdown fence with the actual language (`typescript`, `python`, `go`, ...) - never a framework name (never `svelte`).

### JS/TS-family pitfalls (apply when the codebase is JS/TS)

- Pushing to a collection before its own later `const` declaration in the same scope is a TDZ `ReferenceError` at runtime that type-checkers miss - hoist declarations above first use.
- `array.flatMap(async fn)` returns unresolved Promises, not flattened results - use `(await Promise.all(array.map(fn))).flat()`.
- `as const` on a numeric array makes a readonly tuple that breaks `.includes()` against a wider number type - use `readonly number[]` instead.
- `!res.ok` doesn't narrow a discriminated union (`{ok:true}|{ok:false,message}`) under non-strict TS - compare explicitly (`res.ok === false`).
- Svelte parse-error traps: `class:foo/bar={cond}` (directive name containing `/`) fails - use a ternary on `class={...}` instead; `{/* */}` inside an element's attribute list fails - comments go outside the tag; a missing comma between blocks in `export const actions = {...}` breaks the generated proxy - re-check after adding any action.

Other languages: apply the same vigilance for that family's silent-failure modes (nil/None dereference, swallowed errors, timezone drift, mutability traps) and log project-specific ones in `plan/GOTCHAS.md`.

### UI layout gotchas (web)

- Absolutely-positioned dropdown/suggestion lists get clipped inside an `overflow-x-auto` ancestor (e.g. a grid) - use a native `<datalist>` there instead of a custom-positioned picker. A focus-driven dropdown (`:focus-within`, e.g. DaisyUI) needs the trigger blurred on close, or it won't close on a second click.

## Frontend Conventions

Imports order (adapted to the language): env/config → framework core → third-party modules → internal aliases (`$lib` / `@/` / equivalent) → icons/assets last.

Inputs/props declared at the top of the component; derive, don't copy (Svelte 5 example):

```typescript
let { data } = $props();
const { getTable, company_id, tree } = $derived(data);
```

Page structure (web): page title in the document head, plus a `<noscript>` fallback directly above the main markup:

```html
<noscript>
  <h1 style="font-weight:700; text-align: center;">Please enable Javascript to continue.</h1>
  <style type="text/css">#main-content { display: none; }</style>
</noscript>
```

Modal state + click handler (shape shown in Svelte 5; adapt to the detected framework):

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

Modals always render last in the markup, wrapped in a conditional on the current modal type, using a shared Modal component whose usage shape (e.g. `isOpen` / `header` / `cssClass` props) stays identical across the whole project.

Submit handler - ONE per page handles ALL form submissions and notifications; every server action returns a unique `action` string in the result payload, and custom per-action handling happens inside `if (action === '...')` blocks:

```typescript
const formSubmit = () => {
  loading = true;
  return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
    await update();
    try {
      if (result.type === 'success' && result.data) {
        const { action, message } = result.data;
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
      loading = false;
    }
  };
};
```

## Backend Conventions

Server file structure: env/config imports explicitly at the top → constants/helpers/client instantiation → then the read handler, then all mutation handlers grouped at the bottom (SvelteKit example):

```typescript
export const load: PageServerLoad = async ({ params, locals, url }) => { ... }
export const actions: Actions = { ... }
```

Mutation handler pattern: fetch/parse request input → validate required fields, `fail(400)` if missing → wrap data ops in `try/catch` → verify the mutation succeeded (inserted id, rows-affected, or array length) → await replica sync if the project has one → return `{ action: 'actionName', success: true, message: 'Success message' }`; catch returns `fail(500, { action: 'actionName', success: false, message: 'Failed to ...' })`.

API endpoints / route handlers - applies to every API file:

- Same import order as above; variables/helpers after imports, before handlers.
- One function per HTTP verb (`GET`, `POST`, ...) - if two verbs share identical logic, define one function and assign it to both exports.
- Shared-secret auth for externally-triggered endpoints, never leave one open.
- Data ops in `try/catch`, proper error response on failure - never a bare response.
- Await replica sync after successful mutations (if the project uses one).
- Consistent, predictable JSON shape (e.g. `{ success, found, sent, failed }`).
- File-path header comment and Instructions block apply here too.

## Project Structure

Routing is filesystem-based and deeply nested in most frameworks - search recursively into child folders, never stop at the routes root. URL grouping (SvelteKit `(groups)`, Next.js route groups, etc.) organizes files without affecting URLs; dynamic params use framework syntax (`[param]`, `$param`, `{param}`). Example: `http://localhost:5173/dashboard/12345` → `/src/routes/(dashboard)/dashboard/[company_id]/+page.svelte` (SvelteKit). Always dig to the paired view file and server/data file. Navigation APIs (`resolve()` / `goto()` and equivalents) don't validate that the target route exists - a typo'd path resolves fine and 404s only at runtime.

Components persist across navigation between different values of the same dynamic param with no automatic remount - module-level stores/state can leak the previous param's data into the new page; key on the param (`{#key company_id}`, `key={...}`) or re-derive the relevant state inside an effect keyed on the param.

Component placement by exclusivity: components exclusive to one layout group live in that group's component folder; shared components live in the shared components folder. All API routes live under the API routes root. Local DB files live outside the source tree (e.g. `/data`); dynamic user/app-generated files live in an uploads directory that is NOT compiled into the build output (unlike `/static`).

## Stack

Detect and record in `plan/spec.json` before coding:

- UI framework + version and styling system (e.g. DaisyUI + Tailwind where used).
- Data layer: Turso/SQLite/LibSQL with Drizzle ORM, or MongoDB with Mongoose, or whatever the project uses.
- State: favor framework-native reactivity primitives (`$state`/`$derived`, hooks, refs) over external store libraries; when genuine cross-component client state is needed, writable stores go in `/src/lib/state.ts`, readable stores in `/src/lib/data.ts` (or the project's equivalent locations).
- Canonical commands: autofix, typecheck, build, test.