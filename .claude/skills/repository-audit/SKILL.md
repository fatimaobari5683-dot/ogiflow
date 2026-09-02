---
name: repository-audit
description: Read-only audit of LogiFlow's actual implementation state — stack, schema, modules, tests, security posture — checked against CLAUDE.md. Use when asked to audit, assess, review project status, or check for drift between documentation and code.
---

# Repository Audit

Narrow responsibility: produce an accurate, current, read-only picture of
what LogiFlow actually is — never what it should be, never what a
generic logistics platform would have. This skill never modifies
anything.

## When to use this

- The user asks for a project audit, status report, or "what's actually
  implemented" assessment.
- Before a large feature or architectural change, to confirm the current
  state matches assumptions.
- Periodically, to check whether `CLAUDE.md` has drifted from the code
  (new modules/models/routes added without updating it).

## Process

1. **Read `CLAUDE.md` first.** It is the current baseline claim about
   the architecture. Your job in an audit is partly to verify this claim
   is still true, not just to re-derive everything from scratch.
2. **Inspect, do not assume.** Read `prisma/schema.prisma` for the real
   entity list, `src/modules/*` for the real module list, `package.json`
   for real dependency versions, `src/app/api/v1/**` for real routes,
   `tests/` for real coverage, `.claude/agents/*` for specialist
   definitions. Use `git status`/`git diff` to see in-flight,
   uncommitted work — it's real state, report it as such.
3. **Compare against `CLAUDE.md` explicitly.** For each section of
   `CLAUDE.md` (stack, domain map, state machine, auth model, financial
   invariants, known gaps), note: still accurate / drifted / missing
   entirely. Drift is a finding, not a reason to silently "fix" the
   code or the doc without telling the user.
4. **Classify findings** using IMPLEMENTED / PARTIALLY_IMPLEMENTED /
   NOT_IMPLEMENTED / NEEDS_REVIEW, matching evidence to each claim (a
   file path, a model name, a test file — not a vague impression).
5. **Never present a stub, a dormant/unwired feature, or aspirational
   copy in docs as if it were working.** LogiFlow's own history has real
   examples of exactly this trap (MFA verification was a stub; the
   compliance gate existed but was deliberately inactive) — verify a
   claim by finding the code path, not by finding text that describes it.
6. **Report clearly**: what was checked, what changed since the baseline
   in `CLAUDE.md` (if any), and a short list of anything that needs the
   user's attention (drifted docs, newly discovered gaps, newly
   discovered risks).

## Hard constraints

- Read-only. No file edits, no `git` writes, no `npm install`, no
  `prisma migrate`/`db push`/`db seed`, no running the dev server, no
  destructive shell commands.
- Do not read or print `.env`/`.env.test` contents unless the specific
  task genuinely requires verifying a variable's presence — and even
  then, do not echo secret values.
- If `CLAUDE.md` itself looks stale after the audit, say so explicitly
  and propose the specific edits — do not silently rewrite it as part of
  an audit task unless asked to.
