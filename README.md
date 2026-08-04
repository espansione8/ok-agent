# ok-agent

**Cut AI token burn ~40–80% · Kill long-context degradation before it starts**

Long coding sessions are where tokens compound and output quality rots — every prompt re-sends
the whole history, and buried instructions get forgotten. **ok-agent makes the long session
obsolete**: one short, cheap session per task, with the agent's full project memory restored
from disk in ~8k tokens instead of a 50k+ codebase rescan.

Two drop-in skills make that loop work:

- **`/app-map`** — the memory layer: one deep scan turns any codebase into a machine-readable
  index (`spec.json`) and a human-readable interactive blueprint (`map.html`).
- **`/coding-standard`** — the behavior layer: plan gate → approve → implement → verify → persist memory,
  so short sessions stay disciplined instead of sloppy.

Both are **language- and framework-agnostic**. See [Token economics](#-token-economics) for the
math behind the 40–80% figure.

> ⚠️ **Read the [enforcement model](#enforcement-model--what-these-can-and-cannot-guarantee) before you trust this.**
> These are very well-designed guardrails — not a sandbox. They *mitigate* known LLM failure modes and
> make violations conspicuous and auditable. They cannot, on their own, *guarantee* anything, because
> they are enforced by the same system they are trying to constrain.

---

## Two skills, one loop

`app-map` builds the project's memory; `coding-standard` consumes it, disciplines the work, and keeps it current:

```
                    ┌────────────────────────────────────────────┐
                    │              app-map (once)                │
                    │  9-step scan → .plan/spec.json + map.html  │
                    └───────────────────┬────────────────────────┘
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                  coding-standard (every task)                        │
 │                                                                      │
 │  read spec.json + todo.md ──▶ plan ──▶ wait "ok proceed" ──▶ implement │
 │         ▲                                          │                 │
 │         │            diff-check every edit ◀───────┘                 │
 │         │                    │                                       │
 │  patch spec.json ◀───── spec.json sync check                         │
 │  (incremental)          append todo.md summary                       │
 └──────────────────────────────────────────────────────────────────────┘
                                        ▼
              next session starts from ~8k tokens of disk-backed memory
              instead of a 50k+ codebase rescan
```

---

## Skill 1 — `coding-standard`: engineering discipline

A single `SKILL.md` loaded into your AI coding assistant. It does **not** teach the agent syntax — it teaches *process*:

| Layer | What it imposes |
|---|---|
| 🚫 **Hard Gate** | No code written until the user replies with the literal string `ok proceed`. The skill instructs the agent to treat approval as a mechanical string check, never an inference. |
| 📋 **Architecture Plan** | Every task starts as an atomic, convention-cited todo list written to `.plan/todo.md` *before* approval. |
| 🔒 **Scope Lock** | After approval, only files listed in the plan may be touched. Scope expansions require re-approval. |
| 💾 **Project Memory** | `.plan/todo.md` (gotchas, pitfalls, bugs — rolling summaries) + `.plan/spec.json` (structural index from app-map) persist on disk, surviving session restarts. |
| ✅ **Verification** | Diff check on every edit, comment preservation, typecheck tiers, inline-stated results — every gate is designed to leave an auditable trace. |

Stack-specific conventions live in optional `references/<stack>.md` *profiles*; the core works with any language.

## Skill 2 — `app-map`: codebase memory & blueprints

Maps any project into two artifacts that give the **next agent session full context without re-scanning**:

| Artifact | Audience | What it is |
|---|---|---|
| `.plan/spec.json` | the agent | A standalone structural index: every route (with navigation links), component, store, server module, DB table + columns, auth rule, business rule, env var, and script. Detailed enough that an agent can locate the right file and make a correct edit from `spec.json` alone. |
| `.plan/map.html` | humans | A single self-contained interactive page — blueprint-style route topology with hover-traced wires and a click-to-inspect drawer, plus component/state/database/stack ledgers. No build step, opens in any browser. |

Key properties:

- **Stack-agnostic.** A 9-step procedure (identity → routes → components → state → server modules → schema → business logic/auth → env vars → scripts). Framework-specific hints are examples of *where to look*, never requirements — it works for TypeScript, Python, Go, Rust, Java, Ruby, PHP, C#, and full-stack or backend-only projects.
- **🔒 SECRETS GATE.** `spec.json` and `map.html` are committed/shared artifacts, so the skill forbids copying any literal secret into them — API keys, passwords, tokens, connection strings, and never the values from a real `.env` (names and descriptions only). Hardcoded secrets found in code are logged under `businessLogic.security_notes` with location + purpose, value redacted, flagged *"rotate and move to env"*.
- **Incremental update mode.** When invoked after a small code change, it patches only the affected `spec.json` keys and bumps `generatedAt` — no re-scan, no `map.html` regeneration. This is what keeps the memory current at near-zero cost.
- **Validation before finishing.** Rendered card counts are cross-checked against every `spec.json` array (a dropped card or stale tally fails validation), interactivity is verified, and both artifacts are grepped for leaked secret values.

## What this repo is not

- **Not a security boundary.** Nothing here stops a sufficiently confused model from calling a write tool or leaking a secret.
- **Not deterministic.** Compliance is probabilistic — very high in practice with strong prompt pressure, but not 100%.
- **Not a substitute for harness-level enforcement.** It is designed to be *paired* with it (below).

---

## Failure modes mitigated

Built against the documented weaknesses of LLM coding assistance. "Mitigates" is deliberate:
each mechanism raises the cost of failure and makes failures visible — the elimination layer
belongs to your harness/CI, and the next section tells you where to put it.

### 1. “Lost in the middle”
Models attend poorly to information buried mid-context — early instructions get *behaviorally* forgotten as sessions grow.

**Mitigations:**
- Approval is specified as a **literal string search** for `ok proceed` — inference, tone, and engagement are never consent.
- Every gate produces a **visible artifact** — a diff-check line, a checkbox flip, a `spec.json` verdict, a summary-bound check. Silent compliance becomes conspicuous rather than invisible: a missing artifact is evidence something went wrong.
- Past gotchas are **re-injected at the top of every new plan** (Known constraints checklist), so critical warnings never sink into mid-context.
- A `⛔ FINAL REMINDER` restates the gates at the *end* of each skill — the highest-attention position.

### 2. Context rot
Output quality degrades as context fills, even within the model's nominal window.

**Mitigations:**
- Makes **one-session-per-task** viable and cheap (see [Token economics](#-token-economics)): `app-map`'s `spec.json` plus `todo.md` summaries restore full project awareness in a few thousand tokens.
- Memory is **bounded by design**: at most 3 summary blocks in `todo.md`; completed checklists are deleted after summarization. Working context stays small indefinitely.

### 3. Premature & unauthorized writes
Agents "helpfully" start coding mid-plan, expand scope, or delete files that "look unused".

**Mitigations:**
- Plan mode with a stated write ban until literal approval.
- Execution scope lock: unlisted files frozen; newly discovered work requires re-approval.
- Destructive ops require an explicit `DELETE:`/`RENAME:` flag in the approved plan **plus** an inline authorization statement at execution time.

### 4. Repeated mistakes across sessions
**Mitigation:** every violated constraint — even self-caught — is logged as a permanent `⚠ REPEATED: …` line that is never folded away or softened.

### 5. Redundant codebase rescans
**Mitigation:** `app-map` produces `spec.json` — the compact index new sessions read instead of re-scanning hundreds of files — and coding-standard's per-task sync check patches it incrementally so it never goes stale.

### 6. Silent regressions & comment loss
**Mitigation:** a mandatory `git diff` review after *every* edit scans for deleted comments and contradictions with known constraints — checked against the actual diff, never from memory.

### 7. Secrets leaking into shared docs
**Mitigation:** app-map's SECRETS GATE redacts values in both artifacts and turns every hardcoded secret it finds into a rotation todo. (Enforce the backstop in CI — see below.)

---

## Enforcement model — what these can and cannot guarantee

**The gap, stated plainly:** both skills are written in the same medium they try to constrain —
natural-language rules executed by a probabilistic model. The gates are instructions, not
interlocks. What they buy you is real but specific:

| These skills provide | Only your harness/CI can provide |
|---|---|
| Dramatically reduced violation frequency | Zero-violation guarantees |
| Conspicuous, auditable violations (missing artifacts) | Actual blocking of tool calls |
| An approval *protocol* (`ok proceed`) | Enforcement that writes wait for it |
| Comment/scope rules + a diff-check ritual | Automated checks that run regardless of the model |
| Secret *redaction discipline* in generated docs | Secret scanners that catch leaks anyway |
| Persistent memory across sessions | Storage durability (it's just files) |

**Recommended pairings to close the gap:**

1. **Harness permissions / plan mode** — run the agent read-only until you approve; converts the Hard Gate from instruction into interlock.
2. **Pre-tool-use hooks** — e.g., a hook that denies write/delete tools unless an approval marker exists (sketch, Claude Code–style):
   ```json
   { "hooks": { "PreToolUse": [{
       "matcher": "Write|Edit|Delete",
       "hooks": [{ "type": "command", "command": ".plan/hooks/require-approval.sh" }]
   }]}}
   ```
3. **CI / pre-commit** — script the rituals: fail on deleted comments in touched files, fail on writes outside the plan's file list, fail on empty catch blocks. For app-map output, run a secret scanner (`gitleaks`, `trufflehog`) over `spec.json`/`map.html` as the backstop to the SECRETS GATE.
4. **Review** — the inline verification lines exist so a human can spot-check in seconds.

Treat the skills as the **behavior layer** and these as the **enforcement layer**. Either alone is weaker than both together.

---

## 💰 Token economics

### Why marathon sessions are expensive

In a single session, **every prompt re-sends the entire history**. If each task adds `D` tokens
of reads/diffs/code on top of a base overhead `P`, total input tokens after `n` tasks grow
**quadratically**: `n·P + D·n(n−1)/2`. In a fresh-session strategy the cost per task is the
**constant** `P + D` — and with prompt caching, `P` is nearly free.

### Illustrative model

*Assumptions (mid-size web project): base overhead `P ≈ 40k` tokens (skills ≈ 12k, `spec.json`
≈ 4k, `todo.md` summaries ≈ 2k, system/env ≈ 8k, minimal code reads ≈ 14k); each task adds
`D ≈ 12k`. 10 tasks. Numbers are illustrative — the shape holds for any P/D, and you should
measure your own.*

| Strategy | Raw input tokens (10 tasks) | With prompt caching¹ | If cache TTL lapses² |
|---|---|---|---|
| **Marathon:** 10 prompts, 1 session | **~940k** (final prompt sees ~148k context) | ~240k eff. | ~600–900k |
| **Fresh session per task** | **~520k** (−45%) | ~160k eff. **(−80% vs marathon raw)** | ~200–250k |

¹ e.g. Anthropic-style caching: stable prefix served at ~10% of input price.
The skill files + `spec.json` + `todo.md` form a **stable, cache-friendly prefix** — deliberately written to barely change between sessions.
² Cache TTLs (e.g. 5 min) routinely lapse while *you* review code. Marathon sessions then pay full re-read cost per prompt; fresh sessions only ever pay it once per session.

### What makes fresh sessions cheap

Normally, restarting costs a full codebase rescan (50k+ tokens) — which is why agents marathon.
**`app-map` removes that cost** — its `spec.json` is the rescan, pre-computed and kept current:

```
Marathon session:   [skills + spec + summaries] + task₁ + task₂ + … + task₁₀  ← resent every prompt
Fresh session:      [skills + spec + summaries] + one task                     ← constant size
                          ↑ ~18k tokens restores FULL project memory
```

**Rule of thumb: run `app-map` once, then start a new session per task; say `continue` only to
resume an interrupted one.** Lower token spend, every prompt running on a small, high-attention
context, and the context-rot curve never gets the chance to bend.

---

## How it works — the loop

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│ 0. Resume   │ ──▶ │ 1. Plan      │ ──▶ │ 2. Wait for literal│
│ read .plan/ │     │ write todo.md│     │    "ok proceed"    │
└─────────────┘     └──────────────┘     └─────────┬──────────┘
                                                   ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│ 5. spec.json│ ◀── │ 4. Flip [x], │ ◀── │ 3. Implement       │
│ sync check  │     │ summarize    │     │ diff-check per edit│
└─────────────┘     └──────────────┘     └────────────────────┘
```

- **Approval is specified as mechanical.** Only the literal string `ok proceed` unlocks writing. “yes”, “go ahead”, “sounds good” = feedback, never permission.
- **`continue` resumes** an interrupted, already-approved list — and nothing else.
- **Append-only memory.** Checkbox flips and summaries only; history is never rewritten.
- **Summary bound:** at most 3 summary blocks — warnings are folded, never discarded.
- **spec.json stays current** via the per-task sync check + app-map's incremental patch mode.

## Installation

1. Copy each skill folder into your agent's skills directory (e.g. `.claude/skills/`):
   - `coding-standard/SKILL.md`
   - `app-map/SKILL.md`
2. *(Optional, coding-standard only)* Add stack profiles under `coding-standard/references/` —
   e.g. `svelte-kit.md` — defining framework idioms, verification commands, autofixer tools,
   and DB sync conventions. No profile? The skill falls back to generic conventions + your
   project's existing patterns.
3. First run: ask the agent to **map the project** (`app-map`) — this creates `.plan/spec.json`
   and `.plan/map.html`. Add `.plan/` to `.gitignore` if plans shouldn't be committed
   (but consider committing `spec.json`/`map.html` — they're designed to be shared, secrets redacted).
4. *(Recommended)* Add the harness-level enforcement from the [enforcement model](#enforcement-model--what-these-can-and-cannot-guarantee) section.

## Usage

```
You:  Map this project
Agent: <runs app-map → writes .plan/spec.json + .plan/map.html>

You:  Add CSV export to the invoices page
Agent: PLAN MODE — plan only, no file-write tools until "ok proceed".
       <architecture plan + .plan/todo.md written>
       Review this plan, read codebase, add tasks — do not implement.
You:  ok proceed          ← the only string that unlocks implementation
```

## Repository layout

```
coding-standard/
  SKILL.md          # behavior layer: gates, plan mode, memory, verification
  references/       # optional stack profiles (svelte-kit, django, rails, …)
app-map/
  SKILL.md          # memory layer: 9-step scan → spec.json + map.html
README.md           # this file
LICENSE             # MIT
```

## License

MIT — see [LICENSE](LICENSE). Adapt freely.
