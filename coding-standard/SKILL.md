---
name: coding-standards
description: Language- and framework-agnostic coding standards and agentic workflow — plan/approve/implement gate, todo tracking, and verification steps. Use when writing, reviewing, or modifying code in ANY language, framework, or stack.
category: engineering
---

# Universal Coding Standards & Agentic Workflow

Refer to the rules outlined here verbatim when addressing architectural implementation patterns, regardless of language, framework, or platform. Never over-engineer — write the minimal functional solution following strict YAGNI principles, terse and secure, no verbose explanation unless asked.

## Loading Rules

Always load this skill before writing or modifying code in any language or stack. Always check `plan/spec.json` and `plan/todo.md` before scanning the codebase or drafting a plan. Always run the project's own linter/formatter/autofixer before sending code, if one is configured (eslint/prettier, ruff/black, gofmt, clippy, rubocop, checkstyle, etc. — whatever the project actually uses). Domain- and stack-specific references (framework docs, ORM/DB conventions, deployment notes) may live under `references/` on a per-project basis — consult whichever apply to the current stack. This skill assumes no particular language, framework, UI library, or database; project-specific choices belong in `plan/spec.json` or the project's own docs, not here.

## 🚫 Hard Gate — plan, approve, then implement

Before writing or modifying any code:

1. Read this file in full — every plan item must already reflect these conventions.
2. Produce the 10-section ARCHITECTURE PLAN below, hyper-atomic tasks each citing the convention(s) they follow.
3. Write that task list to `plan/todo.md` (Todo Protocol format, every item `- [ ]`) — the only write permitted before approval. One request = one list, always; a revision edits the same pending list in place under the same `T-<n>` ID — it never appends a second list or takes a new ID.
4. Present the plan as your entire response: the 10 sections, then the full task list, task list MUST be on screen. First line exactly: `PLAN MODE — plan only, no file-write tools until "ok proceed".`
5. Stop. End your turn.

**Approval — a printed check, not a recalled rule.** Before ANY write-tool call (`patch`, `write`, `edit`, `create_file`, `delete_file`, or equivalent), print:

```
Approval check: user's last message = "<verbatim, trimmed>" | exact match to "ok proceed" (case-insensitive, standalone)? YES/NO.
```

- **YES** → implement tasks in order from `plan/todo.md`, flipping checkboxes `- [x]` as completed. Do not re-plan.
- **NO** → the next line must be `→ NOT approved — treating as plan feedback.` No write call follows in that turn, under any framing — "the user seems fine with it," "this is basically approval," and similar reasoning are exactly what this printed check exists to block. Update the same pending list in `plan/todo.md` in place, re-present the full plan, wait again. This mechanism is deliberately mechanical and stack-agnostic: only on printing and acting on a literal string comparison.
- No other approval signal exists. "yes / go ahead / do it / sounds good / lgtm", questions, revisions, new requests, or `ok proceed` embedded inside other text are all NOT approval.
- **Exception:** message is exactly `continue` (standalone) and `plan/todo.md` has an unchecked `- [ ]` item in an already-approved list → skip the gate, run the Interrupted-session check below, resume from the next unchecked item. `continue` never approves a new plan.

**Execution scope lock.** After "ok proceed", touch only files listed in the approved File/folder plan. An unlisted file needs a change? Stop, propose a plan revision, wait for approval again — scope never self-expands.

**Destructive ops — zero assumption.** `delete_file`/rename/move is banned unless that exact path is flagged `DELETE:`/`RENAME:` in the approved plan. Before executing, print: `Destructive op — <path>: authorized by T-<n>.<k>.` A file "looking" unused, dead, or duplicate never authorizes deletion on its own — it may be reached by dynamic imports, reflection, cron jobs, build scripts, or external callers invisible to a static read; comment out or deprecate instead (or the language/tooling's nearest equivalent — e.g. `#[deprecated]`, `@deprecated`, a linter-ignored dead-code marker).

## Plan Sections (10, required every time)

Producing the plan: no code, no file-write tools. Exclude ignored/generated paths (`.gitignore`, build output, vendored dependencies) from codebase reading. One line per fact — not applicable → `N/A.`; empty category → `None.` Never justify an `N/A` or restate what's unchanged; the word already says it. Ask for secrets/config values (env vars, credentials, connection strings) when a task needs them.

1. **Known constraints** — the sentinel item first, always, then every applicable master-list gotcha from `plan/todo.md`. Nothing else applies → sentinel alone.
2. **File/folder plan** — `path — purpose (convention: X, Y)`. Files to be deleted/renamed flagged `DELETE: <path>` / `RENAME: <old> → <new>`; flag new server/API endpoints, entry points, or public interfaces.
3. **Cross-module impact** — search the codebase for key identifiers (field/function/type names) affected by the change, across the whole project, recursively. For each consumer found: does another module/page/service read the same data being changed/removed/renamed? Call the same function or query the same schema? Does a shared interface change affect other callers? One line per inspected file: `file — safe` or `file — affected: <why>`.
4. **Data flow** — only when writing/validating data: `field → validation → write point`; spots where the same rule is enforced twice; shared schema/type definitions + the one file both sides import or reference. Otherwise `N/A.`
5. **Verification gates** — `path — lint/format ✓ · type/compile-check ✓` (the second check only when the language/tooling supports static type-checking or compilation and the change is logic-relevant — function signatures, request/response handlers, shared types/interfaces, schema; markup/style/copy-only edits → `type-check —`). Plan a full build/compile only for new dependencies or build-tooling/config changes.
6. **New dependencies / third-party APIs** — list, flag documentation lookups needed (e.g. via a docs-lookup tool if one is available) to use them correctly. Otherwise `None.`
7. **Convention compliance checklist** — only rows touching this task: File Path Comment, Component/Module Instructions header, naming conventions for mutation handlers, effect/side-effect hygiene, Server Mutation Pattern, API auth, list-rendering/iteration keys, bound vs. one-way/snapshot values.
8. **Responsive & cross-platform check** — any UI-facing change: one line on how it's verified across target platforms/screen sizes/environments. Otherwise `N/A.`
9. **Risks** — client/server (or caller/callee) desync, cross-platform or cross-environment handling. Otherwise `None.`
10. **Assumptions & open questions** — one number each. A task depending on an unconfirmed assumption is flagged `[needs confirmation]` in the todo list — implementation stops there and asks, never proceeds on an assumption. Otherwise `None.`

End the reply with exactly: `Review this plan — do not implement yet.`

## Todo Protocol — `plan/todo.md`

Read the whole file before drafting any plan.

**Layout, fixed order top to bottom:**
```
### Gotchas & Bugs — master list (read first)
- (ALWAYS) Apply coding-standards in full — hard gate, plan/todo.md first, exact "ok proceed" approval, scope lock, destructive-op flags.
- (T-<n>) <gotcha, or bug → root cause → fix>
### Summary — General (T-1..T-<k>)
- T-<n> — <one line>
### Summary — T-<n> — <one line>
### Summary — T-<n+1> — <one line>
## Todo List T-<n+2> — <title> — <YYYY-MM-DD>
Request: <one line>
- [ ] T-<n+2>.1 — <hyper-atomic task> (convention: <cited convention>)
```

- **Master list** — every gotcha/bug ever logged lives here, permanently, and only here. The sentinel item is never deleted, folded, or reworded. New entries append on list completion, tagged `(T-<n>)`. A duplicate merges into the existing item as `⚠ REPEATED: violated again in T-<n>, fixed by <fix>` — never a parallel entry. Wording may compress; nothing is ever deleted.
- **Summaries** — a one-line changelog only, capped at 1 General block + 2 recent individual `### Summary — T-<n>` blocks. Exactly one plain line per entry — never sub-headers, never a "What changed" / "Gotchas / pitfalls" / "Bugs hit & fixes" breakdown. Gotchas and bugs live ONLY in the master list — never restated, even compressed, inside a Summary block. The General block is one bullet per folded `T-<n>`, each a single line — never a per-task write-up. On every completion, state the check regardless of outcome. Over the cap: fold the oldest individual summary into General, e.g. `Summary bound check: 3 individual → folded T-9 into General → now General + T-10, T-11.` Within the cap: still state it, e.g. `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced.
- **Append-only after approval** — the only edits permitted on an APPROVED list are: flipping a task's own checkbox, marking a task or (only on explicit user instruction) a whole list `[~]`, appending/merging master-list entries, writing/folding one-line summaries, deleting a just-completed list's checklist after its summary is written, deleting an abandoned list's task lines. Nothing else is ever rewritten.
- **Lifecycle:** PENDING (draft; every revision edits in place, same `T-<n>`, never a new list) → APPROVED (frozen per the append-only rule above) → COMPLETED or ABANDONED — a list closes exactly these two ways, never a third. On completion (every item `[x]`): harvest new gotchas to the master list, append the one-line summary, delete the checklist entirely, enforce the summary cap, bump the project's version number (patch-level, in whatever manifest the project uses — `package.json`, `pyproject.toml`, `Cargo.toml`, a `VERSION` file, etc.) — same turn, before any new request. ABANDONED only on explicit user instruction: mark the header `- [~] List abandoned by user request: <reason>`, delete its task lines, keep the header line. The agent never abandons or supersedes a list on its own initiative — not to tidy up, not to route around a mistake, not because a new request seems more relevant. A blank-placeholder ID with a quietly started new list is the same violation.
- **Abandoned task** (a single task, not the whole list): mark `- [~] <task> — superseded by T-<n>.<k>: <reason>` — never delete.
- **IDs** — highest `T-<n>` referenced anywhere in the file + 1 for a new list (start `T-1` if the file is new/empty); never reused. Flip `- [ ]`→`- [x]` the instant a task finishes, same turn, and state it: `Todo update: T-6.3 → [x].` A done task with no flip is not recorded.
- **Interrupted session** — an unchecked `- [ ]` item found on read: message is exactly `continue` → resume it. A new request instead → mandatory notice first: `Note: T-6 is still incomplete (4/7 done) — say "continue" to resume, or I'll proceed with this new request instead.` Never silently start a second list over an unmentioned incomplete one.
- **Self-heal on read** (first write of the session, before any plan write): multiple master lists or gotchas scattered outside it → consolidate into one; more than 2 individual summaries → fold to the cap; multiple pending (never-approved) lists for the same request → merge into one under the earliest `T-<n>`, discard the rest (no `[~]` record needed — they were never approved).

**`plan/spec.json`** — fast index of routes/entry-points, data schema, components/modules, shared state, server/backend libs, auth, business logic, config/env vars. Read it instead of re-scanning the codebase; open named files only when a task needs exact current code. If missing, generate an equivalent **lightweight** scan that writes the same schema. Fall back to a full deep read of the codebase if the map is missing. Patch only the affected entries when a task changes a tracked shape — route, schema, component/module, shared state, server lib, config var, auth rule, or business logic (validation, permission, pricing, or constraint rules count — the test is "tracked-shape change," never "styling vs. logic"). Does NOT apply — no observable difference in anything spec.json tracks: styling/formatting swaps, copy edits, debug logging, purely internal refactors with no new file/behavior. Never regenerate the whole file for a small change. State the result inline for every task, with the actual reason, not a stock phrase.

## Post-Change Verification

Every edit, no exceptions, in order:

1. **Diff check first.** `git diff -- <file>` (or pre/post content diff if not a git repo) — read the actual diff, never rely on memory. Scan every `-` line for a removed comment (in whatever syntax the language uses: `//`, `/* */`, `<!-- -->`, `#`, `--`, `;`, etc.) — any found, restore before moving on. Cross-check `-`/`+` lines against this plan's Known constraints; fix any contradiction in the same tool-call cycle. State: `Diff check — <file>: no comments removed, no known-constraint violations.` A write with no stated result is unverified. Runs on every edit, including markup/config-only — those most often silently drop comments.
2. Run the project's linter/formatter/autofixer on every modified file — cheap, single-file, always, whatever the project provides (eslint/prettier, ruff/black, gofmt, clippy, rubocop, checkstyle, swiftlint, etc.).
3. Run the project's type-checker or compiler in check-only mode only when type-relevant: function/method logic, signatures, request/response handlers, a shared type/interface, or a schema. Skip for markup/style/copy-only edits. Batch it across several small type-relevant tasks rather than running it after each one, unless a task touches a shared type/schema and needs an isolated check first.
4. Run the full build and/or test suite only for new dependencies or build-tooling/config changes — never routinely.
5. Confirm zero NEW errors or warnings (pre-existing ones are acceptable but must be called out).
6. Update `plan/spec.json` in the same turn a task's checkbox flips, per the rule above.

## Key Rules

- **Comments are permanent** — never delete one, including dormant commented-out code kept for future forks; checked mechanically via the diff step, never by memory. One that's factually wrong after a change still needs explicit user confirmation before removal or update, stated openly — never removed or updated silently.
- **Files are permanent by default** — same logic: never delete/rename/move because something "looks" unused, duplicate, dead, or legacy. Deletion requires an explicit `DELETE:` entry in the approved plan plus the inline authorization statement (Hard Gate → Destructive ops). When in doubt, comment out or deprecate.
- Prefer an up-to-date documentation-lookup tool (e.g. a docs/context MCP server) for third-party library/framework docs over stale local text files, whenever such a tool is available.
- Use the project's already-established reactivity/state-management pattern consistently — don't introduce a second, competing state-management approach alongside an existing one without a documented reason.
- No global mutable state in server-side/request-handling code — server state must be stateless per request, or one client's data can leak into another's response. Exception: large read-only reference data shared by everyone (e.g. countries, static lookups).
- Editable form fields/inputs seeded from server-provided data must stay bound to live reactive/controlled state, never a one-way/uncontrolled snapshot — many frameworks reset uncontrolled fields to their initial/default value on re-render or form reset, so a one-way value silently reverts to stale data even after a refetch. Use the framework's two-way-binding or controlled-component pattern (`bind:value` in Svelte, controlled `value`+`onChange` in React, `v-model` in Vue, etc.). A static one-way value is fine only for genuinely display-only, non-editable content.
- Every loop/iteration rendering a dynamic or mutable collection needs a unique, stable key per item — not array index — whatever the framework's mechanism (`key` in React, `:key` in Vue, `(expression)` in Svelte's `{#each}`, `trackBy` in Angular, etc.). Index-based or missing keys cause UI state bugs on reorder/insert/delete. Omit the key only for fully static, hardcoded lists.
- One centralized submit/mutation handler per page/view manages ALL form or request submissions for that view — loading state, success/error notification, and field reset — never one separate handler per form on the same page; splitting handlers fragments that logic and drifts inconsistent over time.
- Use one consistent naming convention for create/mutation actions across the codebase (e.g. a `new*` or `create*` prefix) — pick one and apply it everywhere.
- Server-side mutation handlers: validate required input, reject with an appropriate error status if missing → wrap the write operation in a try/catch (or the language's equivalent error-handling construct — `Result`/`?` in Rust, `if err != nil` in Go, etc.) → verify the mutation actually landed (rows affected, inserted ID, returned array length) → propagate/sync to any secondary store or cache the project uses → return a consistent success shape; on failure return a consistent error shape with an appropriate status/error code. Skipping the post-write verification step is how silent data-loss bugs happen.
- API/RPC endpoints reachable by cron, webhooks, or third-party callbacks must check a shared secret or equivalent auth mechanism via header, query param, signed payload, etc. — reject as unauthorized on mismatch, in whatever form the framework's HTTP/RPC layer expects. Never leave an externally-triggered endpoint open.
- Reuse the project's existing shared utility modules before writing a new helper; multi-use utilities are a single shared export, never redefined inline or duplicated across files.
- **File Path Comment** at the top of every source file, stating its own relative path in the comment syntax appropriate to that file type (e.g. `// path/to/file.ts`, `# path/to/file.py`, `<!-- path/to/file.html -->`, `-- path/to/file.sql`). Also add a short **Component/Module Instructions** comment block above any shared/reusable component or module definition (usage, auth requirements, non-obvious assumptions) — so a future agent or human can orient without reading the whole implementation.
- Data-layer queries and secured external fetches happen only in server-side/backend code, never in client-side/frontend code — keeps credentials and query logic out of the client bundle. Applies regardless of framework (SvelteKit `+page.server.ts`, Next.js API routes/Server Components, Django views, Express routes, Rails controllers, etc.).
- No empty error-handling blocks that silently swallow a failure (`catch {}`, an ignored `err`, a discarded `Result`) — always at minimum log or propagate. No leftover citation markers or placeholder tags inside code blocks. Prefer immutable bindings (`const`, `final`, `let` without reassignment, etc.) wherever the language supports them, for both function/variable definitions and exports. Redact secrets as `[REDACTED]`, never inline.
- Any `<form>` (or equivalent submission element) containing a file input or a drag-and-drop upload component needs `enctype="multipart/form-data"` — without it the form still submits with no error, but the file is silently missing from the server-side request body/form-data parse.
- Fence code blocks with the syntax highlighting that matches the actual language inside the block — e.g. a template file's embedded script block should be fenced as `typescript`/`javascript`, not the outer template language, when the two differ.

## Client/UI-Layer Conventions

These apply to whichever presentation layer the project uses (web frontend, mobile UI, desktop UI, CLI, etc.) — adapt the concrete syntax to the actual framework; the principles hold across all of them.

**Import/dependency ordering (where the language groups imports at file top):** environment/config → framework/platform primitives → third-party packages → internal/shared modules → icon/asset libraries last. Follow whatever grouping convention the project has already established if it differs.

**Page/view structure:** set page-level metadata (title, description) where the platform supports it; if the project targets environments where the runtime may be unavailable, provide a graceful fallback (e.g. a no-script notice for web) directly above the main content.

**Modal/dialog state:** manage a single `{ type, target, open }`-style state trio per page/view rather than one boolean flag per modal instance — an ever-growing pile of independent booleans doesn't scale and drifts out of sync. Pseudocode:
```
state currentModal = ''
state currentTarget = null
state isOpen = false

function onOpenModal(type, item):
    resetFields()
    currentModal = type
    currentTarget = item
    isOpen = true
```
One central `resetFields()` per page restores every form-related field to its initial value — call it both before opening a new modal/edit context and after a successful submission (in the submit handler's cleanup/`finally` step). Named partial resets (e.g. `resetSearchFields`) only when a genuinely independent sub-form needs one, each resetting a complete scoped group — never a shortcut around maintaining the main reset function.

Modals/dialogs render last in the markup/component tree, gated on the current modal-state trio above, using whatever shared modal/dialog component the project already has — keep the same prop shape (open/title/size or equivalent) consistent across every usage, not just the surrounding state variable names.

## Server/Backend-Layer Conventions

**Server-side handler file structure:** environment/config imports explicitly at the top → constants/helpers/connection setup → then read/query handlers (`load`, `GET`, index actions, etc.) → then all write/mutation handlers grouped at the bottom.

**Server Mutation Pattern:** parse/validate the incoming request body → validate required fields, return a 400-equivalent error if missing → wrap the write operation (insert/update/delete) in a try/catch or the language's error-handling equivalent → verify the mutation actually succeeded (inserted ID, affected-row count, etc.), return a 500-equivalent if not → propagate to any secondary store/cache the project uses → return a consistent success payload (e.g. `{ action, success: true, message }`); on failure return a consistent error payload with an appropriate status code.

**API/RPC endpoints** — applies to every endpoint under the project's designated API path and any request-handler file: same import order as above; variables/helpers after imports, before handlers; one handler per HTTP verb/RPC method — if two verbs share identical logic, define one function and reuse it for both; shared-secret or equivalent auth for externally-triggered endpoints, never leave one open; data-layer ops in try/catch (or equivalent), an explicit error response on failure — never a bare/empty response; propagate to secondary stores after successful mutations if the project uses one; return a consistent, predictable response shape (e.g. `{ success, found, sent, failed }`). File Path Comment and Component/Module Instructions apply here too.

## Project Structure

Organize the codebase by feature/domain area rather than by file type where the language/framework allows it. If the project uses distinct layout templates or shells (e.g. a dashboard shell, a marketing/public shell, an authenticated-app shell), keep components exclusive to one shell in their own directory, and genuinely shared components in a common shared directory. Keep all API/backend routes under one predictable, discoverable location. Keep local data files and dynamically-generated/user-uploaded files in directories separate from source code and excluded from the build, as the platform requires.

If the framework uses folder-based or convention-based routing (SvelteKit, Next.js, Nuxt, Rails, etc.), search recursively into nested/child folders when locating a route or handler — never stop at the routing root. Layout/route groups that don't affect the URL (parenthesized folders, route groups, etc.) still need to be searched into. Always locate the paired handler/data-loading file alongside a given view file if the framework separates them (e.g. a page component and its server-side loader).

Document the project's actual concrete structure (real paths, real layout names) in `plan/spec.json` or a project README rather than hardcoding assumptions here — this skill deliberately doesn't prescribe a fixed folder layout, since that's stack-specific.

## Stack

This skill is intentionally stack-agnostic: it does not prescribe a language, framework, UI library, styling system, or database. Follow whatever the project has already standardized on, and read that standardization from `plan/spec.json`, the project's dependency manifest, and its own docs — never assume a default. When a stack decision is genuinely open (new project, or no existing precedent for this concern), prefer the current well-supported, stable choice appropriate to the task, and record the decision in `plan/spec.json` or the project README so future agents don't reintroduce inconsistency by guessing differently.

## ⛔ FINAL REMINDER — same gate as the top of this file

This is a full restatement — attention to instructions decays over a long conversation and a shorthand reminder at the bottom is exactly what gets silently skipped many turns in. Read all three in full before your very next tool call:

1. Is it a write to a source file (`patch`, `write`, `edit`, `create_file`, `delete_file`, or any file-mutating tool)? If the user's latest message is NOT exactly `ok proceed` (trimmed, case-insensitive, standalone) — STOP. Print the Approval check line first and confirm the answer is genuinely YES before making this call. There is no implicit approval: a follow-up reply, a compliment, a new request, or a message that merely mentions "ok proceed" inside other text is not permission. The one write allowed before approval is `plan/todo.md` itself, during planning.
2. Is it a write to ANY file NOT listed in the approved plan's File/folder plan? — STOP. Scope never self-expands on its own initiative; propose a plan revision and wait for approval again.
3. Is it `delete_file` / rename / move? — STOP unless that exact path is flagged `DELETE:` / `RENAME:` in the approved plan AND you state `Destructive op — <path>: authorized by T-<n>.<k>` inline first. Never assume a file is unused, dead, or duplicate — it may be reached by dynamic imports, reflection, cron jobs, or external callers invisible to a static read.

Only exception to (1): a message that is exactly `continue` (standalone) while `plan/todo.md` still has an unchecked `- [ ]` item — for that incomplete list only.
