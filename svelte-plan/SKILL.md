---
name: svelte-plan
description: Svelte 5/SvelteKit planning and workflow gate - hard gate (plan → "ok proceed" → implement → verify), the 10-section Plan template, and the plan/GOTCHAS.md + plan/TODO.md Todo Protocol. Mandatorily reads and applies BOTH references/svelte-code.md (the full Svelte coding standards) AND plan/GOTCHAS.md (the full past-mistakes master list) before producing any plan - no plan is ever drafted without both. Use this BEFORE writing, modifying, or reviewing ANY Svelte code, and before drafting or updating plan/TODO.md for a Svelte/SvelteKit project - this is the required entry point for all Svelte work, run first.
category: svelte
---

# Svelte 5 / SvelteKit Planning & Workflow Gate

No plan, no code, no exception. This skill owns the plan → approve → implement → verify loop for Svelte/SvelteKit work. It does not contain the coding standards itself - those live in `references/svelte-code.md`, and this skill's entire job is to force that file to be read and applied before a single line of code gets planned.

## Loading Rules

Always load this skill before writing, modifying, or reviewing any Svelte code, and before drafting or updating `plan/TODO.md`. Before drafting or revising any plan, `references/svelte-code.md` and `plan/GOTCHAS.md` must be read IN FULL (Hard Gate step 1, both gated with a printed check) - always also check `plan/spec.json` and `plan/TODO.md`.

**Mandatory, no exceptions:** `references/svelte-code.md` AND `plan/GOTCHAS.md` must both be read in full before Hard Gate step 2 (producing the plan) in every session/turn a plan is drafted or revised. `references/svelte-code.md` is the single source of truth for every convention cited in the plan and in `plan/TODO.md`; `plan/GOTCHAS.md` is the single source of truth for every past mistake the plan must not repeat, and its applicable entries feed directly into Plan Section 1 (Known constraints). Neither is cached across turns as "already know it" - re-read both before drafting a plan AND before every revision to one, no matter how small. There is no "substantial vs minor" distinction here on purpose: it's exactly the kind of judgment call this skill is built to remove. If a fresh `Conventions check` and `Gotchas check` line isn't printed for this specific revision, the revision doesn't count as gated - even a one-word title tweak needs both lines printed again.

## 🚫 Hard Gate - plan, approve, then implement

Before writing or modifying any Svelte code:

1. Read `references/svelte-code.md` in full - every plan item must already reflect these conventions - AND read `plan/GOTCHAS.md` in full, so every applicable master-list entry is known before a single task is written and no past mistake gets repeated. Then print:
```
Conventions check: references/svelte-code.md read in full → rules applied to this plan. YES/NO.
Gotchas check: plan/GOTCHAS.md read in full → applicable master-list entries carried into Known constraints, past mistakes reviewed. YES/NO.
```
Both lines are required every time, not just the first. If either is NO - STOP here. Do not draft a plan, do not fall back to memory of past conventions or past gotchas.
- `references/svelte-code.md` missing, unreadable, or empty → tell the user it could not be loaded and ask how to proceed. Unlike `plan/spec.json` (which can fall back to a codebase scan), there is no substitute for the conventions file.
- `plan/GOTCHAS.md` missing or empty because no plan has ever run in this project → create the file now with just the sentinel line (see **Missing files**, below) before answering, then answer YES with "sentinel only, nothing to review yet" and proceed - an empty master list is expected on a first plan, not a block. `plan/GOTCHAS.md` exists but is unreadable/corrupt → STOP and ask the user how to proceed, same as the conventions file.
2. Produce the 10-section ARCHITECTURE PLAN below, hyper-atomic tasks each citing the convention(s) they follow from `references/svelte-code.md`.
3. Write that task list to `plan/TODO.md` (Todo Protocol format, every item `- [ ]`) - creating the file if it doesn't exist yet (on a brand-new project it will contain only the `## Todo List T-1 - ...` section, since nothing has been completed yet to summarize). This write, plus scaffolding `plan/GOTCHAS.md` with just its sentinel line when that file is missing (**Missing files**, below), are the only writes permitted before approval. One request = one list, always; a revision edits the same pending list in place under the same `T-<n>` ID - it never appends a second list or takes a new ID.
4. Present the plan as your entire response: the 10 sections and the full task list, task list MUST be on screen. First line exactly: `PLAN MODE - plan only, no file-write tools until "ok proceed".`
5. Stop. End your turn.

**Approval - a printed check, not a recalled rule.** Before ANY write-tool call (`patch`, `write`, `edit`, `create_file`, `delete_file`, or equivalent), print:

```
Approval check: user's last message = "<verbatim, trimmed>" | exact match to "ok proceed" (case-insensitive, standalone)? YES/NO.
```

- **YES** → implement tasks in order from `plan/TODO.md`, flipping checkboxes `- [x]` as completed. Do not re-plan.
- **NO** → the next line must be `→ NOT approved - treating as plan feedback.` No write call follows in that turn, under any framing - "the user seems fine with it," "this is basically approval," and similar reasoning are exactly what this printed check exists to block. Before touching the plan: redo Hard Gate step 1 in full - both files reread, both `Conventions check` and `Gotchas check` lines printed fresh, even for a one-line tweak - then update the same pending list in `plan/TODO.md` in place, re-present the full plan, wait again. This mechanism is deliberately mechanical and model-agnostic: only on printing and acting on a literal string comparison.
- No other approval signal exists. "yes / go ahead / do it / sounds good / lgtm", questions, revisions, new requests, or `ok proceed` embedded inside other text are all NOT approval.
- **Exception:** message is exactly `continue` (standalone) and `plan/TODO.md` has an unchecked `- [ ]` item in an already-approved list → skip the gate, run the Interrupted-session check below, resume from the next unchecked item. `continue` never approves a new plan.

**Execution scope lock.** After "ok proceed", touch only files listed in the approved File/folder plan. An unlisted file needs a change? Stop, propose a plan revision, wait for approval again - scope never self-expands.

**Destructive ops - zero assumption.** `delete_file`/rename/move is banned unless that exact path is flagged `DELETE:`/`RENAME:` in the approved plan. Before executing, print: `Destructive op - <path>: authorized by T-<n>.<k>.` A file "looking" unused, dead, or duplicate never authorizes deletion on its own - it may be reached by dynamic imports, cron jobs, or external callers invisible to a static read; comment out or deprecate instead.

## Plan Sections (10, required every time)

Producing the plan: no code, no file-write tools. Exclude `.gitignore` paths from codebase reading. One line per fact - not applicable → `N/A.`; empty category → `None.` Never justify an `N/A` or restate what's unchanged; the word already says it. Ask for `.env` values when a task needs them. End the reply with exactly: `Review this plan - do not implement yet.`

1. **Known constraints** - the sentinel item first, always, then every applicable master-list gotcha carried over from the Gotchas check in Hard Gate step 1 (`plan/GOTCHAS.md`, read in full before this section is written). Nothing else applies → sentinel alone.
2. **File/folder plan** - `path - purpose (convention: X, Y)`, where X/Y cite rules from `references/svelte-code.md`. Files to be deleted/renamed flagged `DELETE: <path>` / `RENAME: <old> → <new>`; flag new server actions/API routes.
3. **Cross-page impact** - run `search_files` for key field names (e.g. `user`, `product`) across all of `src/routes/`, recursive, to find every consumer. For each: does another page read the same `data` fields being changed/removed/renamed? Query the same tables? Does a UI change affect form data submitted to a shared server action? One line per inspected file: `file - safe` or `file - affected: <why>`.
4. **Data flow** - only when writing/validating data: `field → validation → write point`; spots where the same rule is enforced twice; shared schema field/type pairs + the one file both sides import. Otherwise `N/A.`
5. **Verification gates** - `path - autofixer ✓ · check ✓` (`check ✓` only when type-relevant: script logic/props/events, `+page.server.ts`/`+server.ts`, shared type, schema; markup/class/copy-only → `check -`). Plan `npm run build` only for new dependencies or `vite.config`/adapter changes.
6. **New dependencies / DaisyUI classes** - list, flag Context7 lookups. Otherwise `None.`
7. **Convention compliance checklist** - only rows touching this task, each citing the matching rule in `references/svelte-code.md`: Route Path Comment, Component Instructions header, `formSubmit`/`new*` naming, single `$effect` at script bottom, Server Actions Pattern, API auth, `{#each}` keying, `bind:value` vs `value`.
8. **Responsive & cross-device check** - any `.svelte` change: one line on how it's verified. Otherwise `N/A.`
9. **Risks** - frontend/backend desync, cross-platform handling. Otherwise `None.`
10. **Assumptions & open questions** - one number each after full task list. A task depending on an unconfirmed assumption is flagged `[needs confirmation]` in the todo list - implementation stops there and asks, never proceeds on an assumption. Otherwise `None.`

## Todo Protocol - `plan/GOTCHAS.md` + `plan/TODO.md`

Two separate files, one job each: `plan/GOTCHAS.md` holds the permanent master list of gotchas/bugs, `plan/TODO.md` holds the summaries and the live task list. Read both in full before drafting any plan.

**Layout, fixed order top to bottom.**

`plan/GOTCHAS.md`:
```
### Gotchas & Bugs - master list (read first)
- (ALWAYS) Apply svelte-plan in full - hard gate, plan/TODO.md first, exact "ok proceed" approval, scope lock, destructive-op flags, conventions loaded from references/svelte-code.md.
- (T-<n>) <gotcha, or bug → root cause → fix>
```

`plan/TODO.md`:
```
### Summary - General (T-1..T-<k>)
<real summary paragraph>
### Summary - T-<n>
<real summary paragraph>
### Summary - T-<n+1>
<real summary paragraph>
## Todo List T-<n+2> - <title> - <YYYY-MM-DD>
Request: <one line>
- [ ] T-<n+2>.1 - <hyper-atomic task> (convention: <cited convention>)
```
(more than one `## Todo List` block can be present at once - see **Concurrent lists** below for when and how.)

- **Missing files** - if `plan/` doesn't exist yet, create it. If `plan/GOTCHAS.md` doesn't exist, create it now with just the sentinel line from the Layout above (`### Gotchas & Bugs - master list (read first)` + the `(ALWAYS)` entry) - this scaffolding write is permitted before approval, same exception as `plan/TODO.md` itself (see Hard Gate step 1 and step 3). If `plan/TODO.md` doesn't exist, it gets created by Hard Gate step 3 the first time a plan is written for this project - it starts with no Summary blocks (nothing has been completed yet), just the current `## Todo List T-1 - ...`. Neither missing file is ever a reason to stop and ask; `references/svelte-code.md` is the only file with no substitute.
- **Master list** (`plan/GOTCHAS.md`) - every gotcha/bug ever logged lives here, permanently, and only here. The sentinel item is never deleted, folded, or reworded. A duplicate merges into the existing item as `⚠ REPEATED: violated again in T-<n>, fixed by <fix>` - never a parallel entry. Wording may compress; nothing is ever deleted.
- **Size management** - `plan/GOTCHAS.md` has no entry cap and nothing is ever deleted, but it's read in full before every single plan (Hard Gate step 1), so unchecked growth eventually makes that read slow and expensive - directly undermining the gate it exists to support. Once the file gets big (roughly 40-50 entries, or once it visibly takes longer to read than the rest of the gate): consolidate first - merge near-duplicate gotchas into one entry, tighten wording, collapse long `⚠ REPEATED` chains down to their current fix - state it: `Gotchas size check: consolidated <n> entries → <m>.` If consolidation alone doesn't bring it back to a comfortable size, archive: move entries tied to areas the current codebase no longer touches (a removed integration, a deprecated route) into `plan/GOTCHAS-ARCHIVE.md`, leaving a one-line pointer in the master list - `- (ARCHIVED, see plan/GOTCHAS-ARCHIVE.md) <area> - <n> entries.` `plan/GOTCHAS-ARCHIVE.md` is NOT part of the mandatory every-plan read in Hard Gate step 1 - read it only when the current work touches an archived area, or the user asks. Archiving is never deleting: every entry that leaves the master list is still findable, in full, in the archive file.
- **Live gotcha capture** - the moment a gotcha or bug is hit and fixed during implementation (mid-task, at any point after "ok proceed", not just at list completion), append it to `plan/GOTCHAS.md`'s master list immediately, same turn, tagged `(T-<n>)` - do not defer it to list completion. State it when it happens: `Gotcha logged: T-<n> → <one line>.` A gotcha discovered and fixed but not logged the same turn is not recorded, and a later task in the same list - or a future list - can repeat it, which defeats the whole point of the Gotchas check in Hard Gate step 1.
- **Summaries** (`plan/TODO.md`) - capped at 1 General block + 2 recent individual `### Summary - T-<n>` blocks. Each block is a real summary, not a one-line changelog and never a per-task write-up: a short paragraph (2-5 sentences, prose) that explains what was actually built or changed and why, the way you'd brief a teammate who missed the work - never "T-9.1 did X, T-9.2 did Y." Never sub-headers, never a "What changed" / "Gotchas / pitfalls" / "Bugs hit & fixes" breakdown. Gotchas and bugs live ONLY in `plan/GOTCHAS.md`'s master list - never restated, even compressed, inside a Summary block. The General block is one real summary of the most important changes across T-1..T-<k> - never a per-task write-up. On every completion, state the check regardless of outcome. Over the cap: fold the oldest individual summary into General by rewriting General as one coherent paragraph that absorbs it - never by appending the old text underneath - e.g. `Summary bound check: 3 individual → folded T-9 into General → now General + T-10, T-11.` Within the cap: still state it, e.g. `Summary bound check: 2 individual (T-11, T-12) → within bound, no fold needed.` A completed list with no stated bound-check result is unenforced.
- **Current list** - the live Todo List (`## Todo List T-<n+2> - ...`) stays at the bottom of `plan/TODO.md`, beneath the summaries, for as long as it is PENDING or APPROVED-but-incomplete, so the file always shows the summaries plus whatever is still in flight. It leaves the file only per the Lifecycle rule below, when completed and folded into a summary.
- **Concurrent lists** - if the Interrupted-session notice fires and the user chooses to proceed with the new request instead of resuming the incomplete one, the old list is NOT touched, deleted, or silently abandoned - it stays exactly as it is (still APPROVED, whatever boxes are already checked) in `plan/TODO.md`, and the new list is drafted and, once approved, appended as its own `## Todo List T-<n>` block below it. `plan/TODO.md` can hold more than one concurrent Todo List block this way - each keeps its own heading, `Request:` line, and checkboxes, and each is completed/abandoned independently per the Lifecycle rule. State it when it happens: `T-6 left in place (4/7 done, paused) - drafting T-9 alongside it.` This changes the `continue` exception: if exactly one incomplete APPROVED list exists, `continue` resumes it as before; if more than one exists, bare `continue` is ambiguous - list each incomplete `T-<n>` with its done/total count and ask which one, unless the user's message already names one (e.g. `continue T-6`).
- **Append-only after approval** - the only edits permitted on an APPROVED list are: flipping a task's own checkbox, marking a task or (only on explicit user instruction) a whole list `[~]`, appending/merging entries into `plan/GOTCHAS.md`'s master list (see Live gotcha capture - this one happens throughout implementation, the instant it occurs, not just at completion), writing/folding summary paragraphs in `plan/TODO.md`, deleting a just-completed list's checklist (in `plan/TODO.md`) after its summary is written, deleting an abandoned list's task lines. Nothing else is ever rewritten in either file.
- **Lifecycle:** PENDING (draft; every revision edits in place, same `T-<n>`, never a new list) → APPROVED (frozen per the append-only rule above) → COMPLETED or ABANDONED - a list closes exactly these two ways, never a third. On completion (every item `[x]`): confirm every gotcha hit during the list is already in `plan/GOTCHAS.md`'s master list per Live gotcha capture - log any straggler now if one was missed - append the summary paragraph to `plan/TODO.md`, delete the checklist entirely, enforce the summary cap, bump `package.json` version (patch) - same turn, before any new request. ABANDONED only on explicit user instruction: mark the header `- [~] List abandoned by user request: <reason>`, delete its task lines, keep the header line. The agent never abandons or supersedes a list on its own initiative - not to tidy up, not to route around a mistake, not because a new request seems more relevant. A blank-placeholder ID with a quietly started new list is the same violation.
- **Abandoned task** (a single task, not the whole list): mark `- [~] <task> - superseded by T-<n>.<k>: <reason>` - never delete.
- **IDs** - highest `T-<n>` referenced anywhere in `plan/GOTCHAS.md` or `plan/TODO.md` + 1 for a new list (start `T-1` if both files are new/empty); never reused. Flip `- [ ]`→`- [x]` the instant a task finishes, same turn, and state it: `Todo update: T-6.3 → [x].` A done task with no flip is not recorded.
- **Interrupted session** - an unchecked `- [ ]` item found in `plan/TODO.md` on read: message is exactly `continue` → resume it (if more than one incomplete list exists, see **Concurrent lists** above for how `continue` resolves). A new request instead → mandatory notice first: `Note: T-6 is still incomplete (4/7 done) - say "continue" to resume, or I'll proceed with this new request instead.` Never silently start a second list over an unmentioned incomplete one - if the user proceeds with the new request, the old list is left in place per **Concurrent lists**, never deleted or marked abandoned on the agent's own initiative.
- **Self-heal on read** (first write of the session, before any plan write): multiple master lists or gotchas scattered outside `plan/GOTCHAS.md` → consolidate into one there; more than 2 individual summaries in `plan/TODO.md` → fold to the cap; multiple pending (never-approved) lists for the same request → merge into one under the earliest `T-<n>`, discard the rest (no `[~]` record needed - they were never approved).

**`plan/spec.json`** - fast index of routes, DB schema, components, stores, server libs, auth, business logic, env vars. Read it instead of re-scanning the codebase; open named files only when a task needs exact current code. If missing, try run `svelte-app-map` skill to generate it first - or, if unavailable, an equivalent **lightweight** scan that writes the same schema. Fall back to a full deep read of the codebase if the map is missing. Patch only the affected entries when a task changes a tracked shape - route, DB schema, component, store, server lib, env var, auth rule, or business logic (validation, permission, pricing, or constraint rules count - the test is "tracked-shape change," never "styling vs. logic"). Does NOT apply - no observable difference in anything spec.json tracks: CSS/class swaps, copy edits, `console.log`, inline UI with no new file/behavior, pure internal refactors. Never regenerate the whole file for a small change. State the result inline for every task, with the actual reason, not a stock phrase.

## ⛔ FINAL REMINDER - same gate as the top of this file

This is a full restatement - attention to instructions decays over a long conversation and a shorthand reminder at the bottom is exactly what gets silently skipped many turns in. Read all three in full before your very next tool call:

1. Is it a write to a source file (`patch`, `write`, `edit`, `create_file`, `delete_file`, or any file-mutating tool)? If the user's latest message is NOT exactly `ok proceed` (trimmed, case-insensitive, standalone) - STOP. Print the Approval check line first and confirm the answer is genuinely YES before making this call. There is no implicit approval: a follow-up reply, a compliment, a new request, or a message that merely mentions "ok proceed" inside other text is not permission. The writes allowed before approval are `plan/TODO.md` itself, and scaffolding `plan/GOTCHAS.md` with just its sentinel line if it doesn't exist yet - nothing else, during planning.
2. Is it a write to ANY file NOT listed in the approved plan's File/folder plan? - STOP. Scope never self-expands on its own initiative; propose a plan revision and wait for approval again.
3. Is it `delete_file` / rename / move? - STOP unless that exact path is flagged `DELETE:` / `RENAME:` in the approved plan AND you state `Destructive op - <path>: authorized by T-<n>.<k>` inline first. Never assume a file is unused, dead, or duplicate - it may be reached by dynamic imports, cron jobs, or external callers invisible to a static read.

Only exception to (1): a message that is exactly `continue` (standalone) while `plan/TODO.md` still has an unchecked `- [ ]` item - for that incomplete list only.

Also never forget: no plan in this skill is ever valid without step 1 of the Hard Gate having been run first - and step 1 now means BOTH files. A plan produced without a printed `Conventions check: ... YES` line AND a printed `Gotchas check: ... YES` line is invalid, full stop - discard it and redo step 1, reading `references/svelte-code.md` and `plan/GOTCHAS.md` in full again.
